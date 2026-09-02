import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNenhumaIntegrada } from "./nfe-vinculo-guard";

export const deleteFiscalDocuments = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data, context }) => {
    if (!data.ids?.length) return { ok: true, count: 0 };
    await assertNenhumaIntegrada(context.supabase, data.ids);
    const { error, count } = await context.supabase
      .from("fiscal_documents").delete({ count: "exact" }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: count ?? data.ids.length };
  });

export const getNfeDetails = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("fiscal_documents")
      .select("*, companies(razao_social, nome_fantasia, cnpj, organization_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return null;

    const { data: items } = await context.supabase
      .from("fiscal_document_items")
      .select("*, produtos:product_id(id, codigo_interno, descricao, unidade, ncm, ean_gtin)")
      .eq("document_id", data.id)
      .order("numero_item", { ascending: true });

    const { data: recordedEvents, error: eventsError } = await context.supabase
      .from("fiscal_document_events")
      .select("*")
      .eq("document_id", data.id)
      .order("data_evento", { ascending: true });
    if (eventsError) throw new Error(eventsError.message);

    const [manifestationsResult, ctesResult] = await Promise.all([
      context.supabase
        .from("manifestations")
        .select(
          "id, tipo, tp_evento, descricao_evento, status, response_cstat, response_xmotivo, protocolo, event_at, requested_at, source",
        )
        .eq("company_id", doc.company_id)
        .eq("access_key", doc.chave_acesso)
        .order("requested_at", { ascending: true }),
      context.supabase
        .from("fiscal_documents")
        .select("id, numero, chave_acesso, data_emissao, data_autorizacao, raw_payload, xml_content")
        .eq("company_id", doc.company_id)
        .eq("tipo", "cte")
        .limit(1000),
    ]);
    if (manifestationsResult.error) throw new Error(manifestationsResult.error.message);
    if (ctesResult.error) throw new Error(ctesResult.error.message);

    const { data: totvsRun, error: totvsRunError } = await context.supabase
      .from("totvs_integration_runs")
      .select("status, rm_record_id, finished_at, created_at")
      .eq("fiscal_document_id", data.id)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (totvsRunError) throw new Error(totvsRunError.message);

    type TimelineEvent = {
      id: string;
      tipo_evento: string;
      codigo_evento: string | null;
      descricao: string | null;
      protocolo: string | null;
      data_evento: string | null;
      created_at?: string | null;
    };
    const events: TimelineEvent[] = (recordedEvents ?? []).map((event) => ({
      ...event,
      id: String(event.id),
    }));
    const eventIdentity = new Set(
      events.map((event) => `${event.codigo_evento ?? event.tipo_evento}:${event.protocolo ?? ""}`),
    );

    if (doc.data_autorizacao || doc.protocolo) {
      const hasAuthorization = events.some(
        (event) =>
          event.tipo_evento === "autorizacao" ||
          (Boolean(doc.protocolo) && event.protocolo === doc.protocolo),
      );
      if (!hasAuthorization) {
        events.push({
          id: `authorization-${doc.id}`,
          tipo_evento: "autorizacao",
          codigo_evento: "100",
          descricao: "NF-e autorizada pela SEFAZ",
          protocolo: doc.protocolo,
          data_evento: doc.data_autorizacao,
        });
      }
    }

    for (const manifestation of manifestationsResult.data ?? []) {
      const identity = `${manifestation.tp_evento ?? manifestation.tipo}:${manifestation.protocolo ?? ""}`;
      if (eventIdentity.has(identity)) continue;
      const response = [manifestation.response_cstat, manifestation.response_xmotivo]
        .filter(Boolean)
        .join(" — ");
      events.push({
        id: `manifestation-${manifestation.id}`,
        tipo_evento: `manifestacao_${manifestation.tipo}`,
        codigo_evento: manifestation.tp_evento ?? manifestation.response_cstat,
        descricao: `${manifestation.descricao_evento ?? "Manifestação do destinatário"}${response ? `: ${response}` : ""}`,
        protocolo: manifestation.protocolo,
        data_evento: manifestation.event_at ?? manifestation.requested_at,
      });
      eventIdentity.add(identity);
    }

    for (const cte of ctesResult.data ?? []) {
      const searchable = `${JSON.stringify(cte.raw_payload ?? {})}\n${cte.xml_content ?? ""}`;
      if (!searchable.includes(doc.chave_acesso)) continue;
      events.push({
        id: `cte-${cte.id}`,
        tipo_evento: "cte_vinculado",
        codigo_evento: null,
        descricao: `CT-e nº ${cte.numero ?? "-"} vinculado a esta NF-e (chave ${cte.chave_acesso}).`,
        protocolo: null,
        data_evento: cte.data_autorizacao ?? cte.data_emissao,
      });
    }
    events.sort((left, right) => {
      const leftTime = new Date(left.data_evento ?? left.created_at ?? 0).getTime();
      const rightTime = new Date(right.data_evento ?? right.created_at ?? 0).getTime();
      return leftTime - rightTime;
    });

    // Sugestões de vínculo para itens pendentes, com base no cadastro
    // Produto > aba Fornecedores (produtos_fornecedores).
    type Sugestao = {
      produto_id: string;
      codigo_interno: string;
      descricao: string;
      unidade: string | null;
      ncm: string | null;
      origem: "fornecedor" | "similaridade";
      score?: number;
    };
    const suggestions: Record<string, Sugestao> = {};
    const orgId: string | null = (doc as any)?.companies?.organization_id ?? null;
    const emitCnpj: string | null = (doc as any)?.emitente_cnpj ?? null;
    const pendentes = (items ?? []).filter((i: any) => i.status_vinculo !== "vinculado" && i.codigo);

    if (orgId && emitCnpj && pendentes.length) {
      const digits = emitCnpj.replace(/\D/g, "");
      const { data: sup } = await context.supabase
        .from("suppliers")
        .select("id")
        .eq("organization_id", orgId)
        .or(`cnpj_cpf.eq.${emitCnpj},cnpj_cpf.eq.${digits}`)
        .limit(1)
        .maybeSingle();

      if (sup) {
        const codigos = Array.from(new Set(pendentes.map((i: any) => String(i.codigo))));
        const { data: vinculos } = await context.supabase
          .from("produtos_fornecedores")
          .select("codigo_item_nota, produto_id, produtos(id, codigo_interno, descricao, unidade, ncm)")
          .eq("fornecedor_id", (sup as any).id)
          .in("codigo_item_nota", codigos);

        const porCodigo = new Map<string, any>();
        for (const v of (vinculos ?? []) as any[]) {
          if (v.produtos) porCodigo.set(String(v.codigo_item_nota), v);
        }
        for (const item of pendentes as any[]) {
          const v = porCodigo.get(String(item.codigo));
          if (!v) continue;
          suggestions[item.id] = {
            produto_id: v.produto_id,
            codigo_interno: v.produtos.codigo_interno,
            descricao: v.produtos.descricao,
            unidade: v.produtos.unidade ?? null,
            ncm: v.produtos.ncm ?? null,
            origem: "fornecedor",
          };
        }
      }
    }

    // Fallback: quando não há vínculo cadastrado, sugerir por similaridade
    // entre a descrição do item da NF-e e a descrição do produto cadastrado.
    const semSugestao = (pendentes as any[]).filter((i) => !suggestions[i.id] && i.descricao);
    if (orgId && semSugestao.length) {
      const companyId: string | null = (doc as any)?.company_id ?? null;
      let q = context.supabase
        .from("produtos")
        .select("id, codigo_interno, descricao, unidade, ncm, ean_gtin, company_id")
        .eq("organization_id", orgId)
        .eq("ativo", true)
        .limit(3000);
      if (companyId) q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
      const { data: produtos } = await q;

      const normalizar = (s: string) =>
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .replace(/[^A-Z0-9 ]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const tokens = (s: string) =>
        new Set(normalizar(s).split(" ").filter((t) => t.length > 2));

      const catalogo = ((produtos ?? []) as any[]).map((p) => ({
        p,
        toks: tokens(String(p.descricao ?? "")),
      }));

      for (const item of semSugestao) {
        const itemToks = tokens(String(item.descricao));
        if (!itemToks.size) continue;
        const ean = item.ean ? String(item.ean).replace(/\D/g, "") : "";
        let melhor: { p: any; score: number } | null = null;

        for (const c of catalogo) {
          // EAN idêntico é match forte e imediato
          const pEan = c.p.ean_gtin ? String(c.p.ean_gtin).replace(/\D/g, "") : "";
          if (ean && pEan && ean === pEan) {
            melhor = { p: c.p, score: 1 };
            break;
          }
          if (!c.toks.size) continue;
          let inter = 0;
          for (const t of itemToks) if (c.toks.has(t)) inter++;
          if (!inter) continue;
          const uniao = itemToks.size + c.toks.size - inter;
          let score = inter / uniao;
          // pequeno bônus quando o NCM também coincide
          if (item.ncm && c.p.ncm && String(item.ncm) === String(c.p.ncm)) score += 0.1;
          if (!melhor || score > melhor.score) melhor = { p: c.p, score };
        }

        if (melhor && melhor.score >= 0.5) {
          suggestions[item.id] = {
            produto_id: melhor.p.id,
            codigo_interno: melhor.p.codigo_interno,
            descricao: melhor.p.descricao,
            unidade: melhor.p.unidade ?? null,
            ncm: melhor.p.ncm ?? null,
            origem: "similaridade",
            score: Math.min(1, Math.round(melhor.score * 100) / 100),
          };
        }
      }
    }

    return {
      document: doc,
      items: items ?? [],
      events: events ?? [],
      suggestions,
      totvsRun: totvsRun ?? null,
    };
  });
