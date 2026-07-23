import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ClassificationTable = "familias" | "grupos" | "subgrupos";

export type ClassificationInput = {
  id?: string;
  tabela: ClassificationTable;
  company_id: string | null;
  codigo: string;
  descricao: string;
};

async function orgOf(context: any, companyId: string | null): Promise<string> {
  if (companyId) {
    const { data: c, error } = await context.supabase
      .from("companies").select("organization_id").eq("id", companyId).maybeSingle();
    if (error || !c) throw new Error("Empresa não encontrada");
    return c.organization_id as string;
  }
  const { data: orgId, error } = await context.supabase.rpc("ensure_user_organization");
  if (error || !orgId) throw new Error("Organização não encontrada");
  return orgId as string;
}

export const listClassifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tabela: ClassificationTable; companyId?: string }) => data)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from(data.tabela).select("*").order("codigo");
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ClassificationInput) => {
    if (!["familias", "grupos", "subgrupos"].includes(data.tabela)) throw new Error("Tabela inválida");
    if (!data.codigo?.trim()) throw new Error("Código é obrigatório");
    if (!data.descricao?.trim()) throw new Error("Descrição é obrigatória");
    return data;
  })
  .handler(async ({ data, context }) => {
    const organization_id = await orgOf(context, data.company_id);
    const payload: any = {
      organization_id,
      company_id: data.company_id ?? null,
      codigo: data.codigo.trim(),
      descricao: data.descricao.trim(),
    };
    if (data.id) {
      const { error } = await context.supabase.from(data.tabela).update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from(data.tabela).insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (inserted as any).id as string };
  });

export const deleteClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tabela: ClassificationTable; id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from(data.tabela).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
