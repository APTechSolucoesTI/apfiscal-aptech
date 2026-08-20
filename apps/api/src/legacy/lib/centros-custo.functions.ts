import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CentroCustoInput = {
  id?: string;
  company_id: string | null;
  codigo: string;
  descricao: string;
  ativo?: boolean;
};

const CODIGO_RE = /^\d{2}(\.\d{4})?$/;

async function orgIdOf(context: any, companyId: string | null): Promise<string> {
  if (companyId) {
    const { data, error } = await context.supabase
      .from("companies").select("organization_id").eq("id", companyId).maybeSingle();
    if (error || !data) throw new Error("Empresa não encontrada");
    return data.organization_id as string;
  }
  const { data: orgId, error } = await context.supabase.rpc("ensure_user_organization");
  if (error || !orgId) throw new Error("Organização não encontrada");
  return orgId as string;
}

export const listCentrosCusto = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId?: string; apenasAtivos?: boolean }) => data)
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any).from("centros_custo").select("*").order("codigo");
    // Quando uma empresa é informada, inclui também os cadastros globais (company_id IS NULL)
    if (data.companyId) q = q.or(`company_id.eq.${data.companyId},company_id.is.null`);
    if (data.apenasAtivos) q = q.eq("ativo", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });


export const saveCentroCusto = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CentroCustoInput) => {
    if (!CODIGO_RE.test(data.codigo)) throw new Error("Código deve estar no formato 99 ou 99.9999");
    if (!data.descricao?.trim()) throw new Error("Descrição é obrigatória");
    return data;
  })
  .handler(async ({ data, context }) => {
    const organization_id = await orgIdOf(context, data.company_id ?? null);
    const payload = {
      organization_id,
      company_id: data.company_id ?? null,
      codigo: data.codigo.trim(),
      descricao: data.descricao.trim(),
      ativo: data.ativo ?? true,
    };
    if (data.id) {
      const { error } = await (context.supabase as any).from("centros_custo").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await (context.supabase as any)
      .from("centros_custo").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const toggleCentroCustoAtivo = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; ativo: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("centros_custo").update({ ativo: data.ativo }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCentroCusto = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    // Bloqueia se houver vínculo em NF-e (cabeçalho ou item)
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      (context.supabase as any).from("nfe_centro_custo").select("id", { count: "exact", head: true }).eq("centro_custo_id", data.id),
      (context.supabase as any).from("nfe_item_centro_custo").select("id", { count: "exact", head: true }).eq("centro_custo_id", data.id),
    ]);
    if ((c1 ?? 0) + (c2 ?? 0) > 0) {
      throw new Error("Este Centro de Custo possui vínculos em NF-e. Inative-o em vez de excluir.");
    }
    const { error } = await (context.supabase as any).from("centros_custo").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
