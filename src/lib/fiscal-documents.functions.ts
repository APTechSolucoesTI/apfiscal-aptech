import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNenhumaIntegrada } from "./nfe-vinculo-guard";

export const deleteFiscalDocuments = createServerFn({ method: "POST" })
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

export const getNfeDetails = createServerFn({ method: "GET" })
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
    const suggestions: Record<string, { produto_id: string; codigo_interno: string; descricao: string; unidade: string | null; ncm: string | null }> = {};
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
          };
        }
      }
    }

    return { document: doc, items: items ?? [], events: events ?? [], suggestions };
  });

