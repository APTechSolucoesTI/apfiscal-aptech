import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProductInput = {
  id?: string;
  company_id: string | null;
  codigo: string;
  codigo_fornecedor?: string | null;
  descricao: string;
  ncm?: string | null;
  cest?: string | null;
  cfop_padrao?: string | null;
  unidade?: string | null;
  ean?: string | null;
  origem_mercadoria?: string | null;
  valor_unitario?: number | null;
  aliquota_icms?: number | null;
  aliquota_ipi?: number | null;
  supplier_id?: string | null;
  ativo?: boolean;
  erp_system?: string | null;
  erp_code?: string | null;
  erp_external_id?: string | null;
  erp_metadata?: Record<string, unknown>;
};

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId?: string }) => data)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("products")
      .select("*, companies(razao_social, cnpj), suppliers(razao_social, cnpj_cpf)")
      .order("descricao");
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProductInput) => data)
  .handler(async ({ data, context }) => {
    let organization_id: string;
    if (data.company_id) {
      const { data: company, error: cErr } = await context.supabase
        .from("companies").select("organization_id").eq("id", data.company_id).maybeSingle();
      if (cErr || !company) throw new Error("Empresa não encontrada");
      organization_id = company.organization_id as string;
    } else {
      const { data: orgId, error: oErr } = await context.supabase.rpc("ensure_user_organization");
      if (oErr || !orgId) throw new Error("Organização não encontrada");
      organization_id = orgId as string;
    }
    const payload = { ...data, company_id: data.company_id ?? null, organization_id };
    const { id, ...rest } = payload;
    if (id) {
      const { error } = await context.supabase.from("products").update(rest as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: inserted, error } = await context.supabase.from("products").insert(rest as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data, context }) => {
    if (!data.ids?.length) return { ok: true, count: 0 };
    const { error, count } = await context.supabase
      .from("products").delete({ count: "exact" }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: count ?? data.ids.length };
  });


/**
 * Ingest NF-e emitente + itens and auto-create supplier/products if missing.
 * Called by the NF-e ingestion pipeline.
 */
export type NfeIngestPayload = {
  companyId: string;
  emitente: {
    cnpj: string;
    razao_social: string;
    nome_fantasia?: string;
    inscricao_estadual?: string;
    endereco?: Record<string, string>;
  };
  itens: Array<{
    codigo: string;
    descricao: string;
    ncm?: string;
    cfop?: string;
    unidade?: string;
    ean?: string;
    valor_unitario?: number;
  }>;
};

export const ingestNfeCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: NfeIngestPayload) => data)
  .handler(async ({ data, context }) => {
    const { data: company, error: cErr } = await context.supabase
      .from("companies").select("organization_id").eq("id", data.companyId).maybeSingle();
    if (cErr || !company) throw new Error("Empresa não encontrada");

    const { data: supplierId, error: sErr } = await context.supabase.rpc("upsert_supplier_from_nfe", {
      _organization_id: company.organization_id,
      _company_id: data.companyId,
      _cnpj: data.emitente.cnpj,
      _razao_social: data.emitente.razao_social,
      _nome_fantasia: data.emitente.nome_fantasia ?? undefined,
      _ie: data.emitente.inscricao_estadual ?? undefined,
      _endereco: data.emitente.endereco ?? {},
    } as never);
    if (sErr) throw new Error(sErr.message);

    const productIds: string[] = [];
    for (const item of data.itens) {
      const { data: pid, error: pErr } = await context.supabase.rpc("upsert_product_from_nfe", {
        _organization_id: company.organization_id,
        _company_id: data.companyId,
        _codigo: item.codigo,
        _descricao: item.descricao,
        _ncm: item.ncm ?? undefined,
        _cfop: item.cfop ?? undefined,
        _unidade: item.unidade ?? undefined,
        _ean: item.ean ?? undefined,
        _valor_unitario: item.valor_unitario ?? undefined,
        _supplier_id: supplierId as string,
      } as never);
      if (pErr) throw new Error(pErr.message);
      productIds.push(pid as string);
    }

    return { supplierId: supplierId as string, productIds };
  });
