import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProdutoInput = {
  id?: string;
  company_id: string | null;
  codigo_interno: string;
  descricao: string;
  unidade: string;
  ean_gtin?: string | null;
  ncm: string;
  cest?: string | null;
  origem_mercadoria: number;
  familia_id?: string | null;
  grupo_id?: string | null;
  subgrupo_id?: string | null;
  ativo?: boolean;
};

async function resolveOrganizationId(context: { supabase: any }, companyId: string | null): Promise<string> {
  if (companyId) {
    const { data: company, error } = await context.supabase
      .from("companies").select("organization_id").eq("id", companyId).maybeSingle();
    if (error || !company) throw new Error("Empresa não encontrada");
    return company.organization_id as string;
  }
  const { data: orgId, error } = await context.supabase.rpc("ensure_user_organization");
  if (error || !orgId) throw new Error("Organização não encontrada");
  return orgId as string;
}

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId?: string }) => data)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("produtos")
      .select("*, companies(razao_social, cnpj), familias(codigo, descricao), grupos(codigo, descricao), subgrupos(codigo, descricao)")
      .order("descricao");
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("produtos")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProdutoInput) => {
    if (!data.codigo_interno?.trim()) throw new Error("Código interno é obrigatório");
    if (!data.descricao?.trim()) throw new Error("Descrição é obrigatória");
    if (!data.unidade?.trim()) throw new Error("Unidade é obrigatória");
    if (!/^\d{8}$/.test(data.ncm ?? "")) throw new Error("NCM deve ter 8 dígitos numéricos");
    if (data.origem_mercadoria < 0 || data.origem_mercadoria > 8) throw new Error("Origem inválida (0 a 8)");
    return data;
  })
  .handler(async ({ data, context }) => {
    const organization_id = await resolveOrganizationId(context, data.company_id);
    const payload: any = {
      organization_id,
      company_id: data.company_id ?? null,
      codigo_interno: data.codigo_interno.trim(),
      descricao: data.descricao.trim(),
      unidade: data.unidade.trim(),
      ean_gtin: data.ean_gtin || null,
      ncm: data.ncm,
      cest: data.cest || null,
      origem_mercadoria: data.origem_mercadoria,
      familia_id: data.familia_id || null,
      grupo_id: data.grupo_id || null,
      subgrupo_id: data.subgrupo_id || null,
      ativo: data.ativo ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase.from("produtos").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase.from("produtos").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (inserted as any).id as string };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("produtos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data, context }) => {
    if (!data.ids?.length) return { ok: true, count: 0 };
    const { error, count } = await context.supabase
      .from("produtos").delete({ count: "exact" }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: count ?? data.ids.length };
  });

// ----------- Produto x Fornecedor -----------
export type ProdutoFornecedorInput = {
  id?: string;
  produto_id: string;
  fornecedor_id: string;
  codigo_item_nota: string;
  empresa_id?: string | null;
};

export const listProductSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { produtoId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("produtos_fornecedores")
      .select("*, suppliers(id, razao_social, nome_fantasia, cnpj_cpf, codigo_interno)")
      .eq("produto_id", data.produtoId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveProductSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProdutoFornecedorInput) => {
    if (!data.produto_id) throw new Error("Produto obrigatório");
    if (!data.fornecedor_id) throw new Error("Fornecedor obrigatório");
    if (!data.codigo_item_nota?.trim()) throw new Error("Código do item na nota é obrigatório");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: produto, error: pErr } = await context.supabase
      .from("produtos").select("organization_id, company_id").eq("id", data.produto_id).maybeSingle();
    if (pErr || !produto) throw new Error("Produto não encontrado");
    const payload: any = {
      organization_id: (produto as any).organization_id,
      empresa_id: data.empresa_id ?? (produto as any).company_id ?? null,
      produto_id: data.produto_id,
      fornecedor_id: data.fornecedor_id,
      codigo_item_nota: data.codigo_item_nota.trim(),
    };
    if (data.id) {
      const { error } = await context.supabase.from("produtos_fornecedores").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("produtos_fornecedores").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (inserted as any).id as string };
  });

export const deleteProductSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("produtos_fornecedores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------- Item da NF-e: vincular a produto existente / criar novo -----------
export const linkNfeItemToProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; produtoId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: item, error: iErr } = await context.supabase
      .from("fiscal_document_items")
      .select("id, codigo, document_id, fiscal_documents(company_id, companies(organization_id))")
      .eq("id", data.itemId)
      .maybeSingle();
    if (iErr || !item) throw new Error("Item não encontrado");
    const doc = (item as any).fiscal_documents;
    const orgId = doc?.companies?.organization_id;
    const companyId = doc?.company_id;

    const { data: docRow } = await context.supabase
      .from("fiscal_documents").select("emitente_cnpj").eq("id", (item as any).document_id).maybeSingle();
    const emitCnpj: string | null = (docRow as any)?.emitente_cnpj ?? null;

    if (emitCnpj) {
      const { data: sup } = await context.supabase
        .from("suppliers").select("id")
        .eq("organization_id", orgId)
        .or(`cnpj_cpf.eq.${emitCnpj},cnpj_cpf.eq.${emitCnpj.replace(/\D/g, "")}`)
        .limit(1).maybeSingle();
      if (sup && (item as any).codigo) {
        await context.supabase.from("produtos_fornecedores").upsert({
          organization_id: orgId,
          empresa_id: companyId,
          produto_id: data.produtoId,
          fornecedor_id: (sup as any).id,
          codigo_item_nota: (item as any).codigo,
        }, { onConflict: "empresa_id,fornecedor_id,codigo_item_nota", ignoreDuplicates: true } as any);
      }
    }

    const { error } = await context.supabase
      .from("fiscal_document_items")
      .update({ product_id: data.produtoId, status_vinculo: "vinculado" })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
