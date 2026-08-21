import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SupplierInput = {
  id?: string;
  company_id: string | null;
  cnpj_cpf: string;
  tipo_pessoa?: string;
  razao_social: string;
  nome_fantasia?: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  erp_system?: string | null;
  erp_code?: string | null;
  erp_external_id?: string | null;
  erp_metadata?: Record<string, unknown>;
};

export const listSuppliers = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId?: string }) => data)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("suppliers").select("*, companies(razao_social, cnpj)").order("razao_social");
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listSupplierFiscalDocuments = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { supplierId: string }) => data)
  .handler(async ({ data, context }) => {
    const supplierResult = await context.supabase
      .from("suppliers")
      .select("id, organization_id, company_id, cnpj_cpf")
      .eq("id", data.supplierId)
      .maybeSingle();
    if (supplierResult.error) throw new Error(supplierResult.error.message);
    if (!supplierResult.data) throw new Error("Fornecedor não encontrado ou sem acesso.");

    const supplier = supplierResult.data;
    const linkedQuery = context.supabase
      .from("fiscal_documents")
      .select("id, numero, serie, chave_acesso, data_emissao, valor_total, tipo_operacao, situacao, status, supplier_id, company_id, companies(razao_social, nome_fantasia)")
      .eq("tipo", "nfe")
      .eq("supplier_id", supplier.id)
      .order("data_emissao", { ascending: false });
    const linked = supplier.company_id
      ? await linkedQuery.eq("company_id", supplier.company_id)
      : await linkedQuery;

    if (linked.error) throw new Error(linked.error.message);
    if ((linked.data?.length ?? 0) > 0) return linked.data ?? [];

    const digits = String(supplier.cnpj_cpf).replace(/\D/g, "");
    const variants = [digits, supplier.cnpj_cpf];
    if (digits.length === 14) variants.push(`${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`);
    if (digits.length === 11) variants.push(`${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`);
    const fallbackQuery = context.supabase
      .from("fiscal_documents")
      .select("id, numero, serie, chave_acesso, data_emissao, valor_total, tipo_operacao, situacao, status, supplier_id, company_id, companies(razao_social, nome_fantasia)")
      .eq("tipo", "nfe")
      .in("emitente_cnpj", [...new Set(variants)])
      .order("data_emissao", { ascending: false });
    const fallback = supplier.company_id
      ? await fallbackQuery.eq("company_id", supplier.company_id)
      : await fallbackQuery;
    if (fallback.error) throw new Error(fallback.error.message);
    return fallback.data ?? [];
  });

export const saveSupplier = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SupplierInput) => data)
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
      const { error } = await context.supabase.from("suppliers").update(rest as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: inserted, error } = await context.supabase.from("suppliers").insert(rest as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const deleteSupplier = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSuppliers = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data, context }) => {
    if (!data.ids?.length) return { ok: true, count: 0 };
    const { error, count } = await context.supabase
      .from("suppliers").delete({ count: "exact" }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: count ?? data.ids.length };
  });

