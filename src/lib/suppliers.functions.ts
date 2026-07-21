import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SupplierInput = {
  id?: string;
  company_id: string;
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

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId?: string }) => data)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("suppliers").select("*, companies(razao_social, cnpj)").order("razao_social");
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SupplierInput) => data)
  .handler(async ({ data, context }) => {
    const { data: company, error: cErr } = await context.supabase
      .from("companies").select("organization_id").eq("id", data.company_id).maybeSingle();
    if (cErr || !company) throw new Error("Empresa não encontrada");
    const payload = { ...data, organization_id: company.organization_id };
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

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
