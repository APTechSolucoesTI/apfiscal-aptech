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

    const { data: events } = await context.supabase
      .from("fiscal_document_events")
      .select("*")
      .eq("document_id", data.id)
      .order("data_evento", { ascending: true });

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

    return { document: doc, items: items ?? [], events: events ?? [], suggestions };
  });


