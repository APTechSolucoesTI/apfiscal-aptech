import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlanoContasInput = {
  id?: string;
  company_id: string | null;
  conta_pai_id?: string | null;
  codigo: string;
  descricao: string;
  ativo?: boolean;
  permite_lancamentos?: boolean;
};

const NIVEL1 = /^\d{2}$/;
const NIVEL2 = /^\d{2}\.\d{3}$/;
const NIVEL3 = /^\d{2}\.\d{3}\.\d{4}$/;
function codigoValido(c: string) {
  return NIVEL1.test(c) || NIVEL2.test(c) || NIVEL3.test(c);
}

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

export const listPlanoContas = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId?: string; apenasLancaveis?: boolean; apenasAtivos?: boolean }) => data)
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any).from("plano_contas").select("*").order("codigo");
    // Quando uma empresa é informada, inclui também os cadastros globais (company_id IS NULL)
    if (data.companyId) q = q.or(`company_id.eq.${data.companyId},company_id.is.null`);
    if (data.apenasLancaveis) q = q.eq("permite_lancamentos", true);
    if (data.apenasAtivos) q = q.eq("ativo", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });


export const proximoCodigoPlanoContas = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string | null; contaPaiId?: string | null }) => data)
  .handler(async ({ data, context }) => {
    let prefix = "";
    let level: 1 | 2 | 3 = 1;
    if (data.contaPaiId) {
      const { data: pai } = await (context.supabase as any)
        .from("plano_contas").select("codigo").eq("id", data.contaPaiId).maybeSingle();
      if (!pai) throw new Error("Conta pai não encontrada");
      prefix = pai.codigo + ".";
      level = NIVEL1.test(pai.codigo) ? 2 : NIVEL2.test(pai.codigo) ? 3 : 3;
      if (level === 3 && NIVEL3.test(pai.codigo)) throw new Error("Nível máximo atingido (não é permitido subcontas nível 4)");
    }
    const width = level === 1 ? 2 : level === 2 ? 3 : 4;
    let sq = (context.supabase as any)
      .from("plano_contas").select("codigo").like("codigo", `${prefix}%`);
    sq = data.companyId
      ? sq.or(`company_id.eq.${data.companyId},company_id.is.null`)
      : sq.is("company_id", null);
    const { data: irmaos } = await sq;
    let max = 0;
    for (const r of (irmaos ?? []) as any[]) {
      const rest = r.codigo.slice(prefix.length);
      if (!/^\d+$/.test(rest)) continue;
      // Considera apenas irmãos diretos (mesmo nível)
      if (rest.length !== width) continue;
      const n = parseInt(rest, 10);
      if (n > max) max = n;
    }
    const next = String(max + 1).padStart(width, "0");
    return { codigo: prefix + next };
  });

export const savePlanoContas = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PlanoContasInput) => {
    if (!codigoValido(data.codigo)) throw new Error("Código inválido. Use 99, 99.999 ou 99.999.9999");
    if (!data.descricao?.trim()) throw new Error("Descrição é obrigatória");
    return data;
  })
  .handler(async ({ data, context }) => {
    const organization_id = await orgIdOf(context, data.company_id ?? null);
    const payload: any = {
      organization_id,
      company_id: data.company_id ?? null,
      conta_pai_id: data.conta_pai_id ?? null,
      codigo: data.codigo.trim(),
      descricao: data.descricao.trim(),
      ativo: data.ativo ?? true,
      permite_lancamentos: data.permite_lancamentos ?? true,
    };
    if (data.id) {
      const { error } = await (context.supabase as any).from("plano_contas").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await (context.supabase as any)
      .from("plano_contas").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const togglePlanoContasAtivo = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; ativo: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("plano_contas").update({ ativo: data.ativo }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePlanoContas = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const [{ count: subs }, { count: docs }, { count: items }] = await Promise.all([
      (context.supabase as any).from("plano_contas").select("id", { count: "exact", head: true }).eq("conta_pai_id", data.id),
      (context.supabase as any).from("fiscal_documents").select("id", { count: "exact", head: true }).eq("plano_contas_id", data.id),
      (context.supabase as any).from("fiscal_document_items").select("id", { count: "exact", head: true }).eq("plano_contas_id", data.id),
    ]);
    if ((subs ?? 0) > 0) throw new Error("Esta conta possui subcontas. Exclua-as primeiro ou inative.");
    if ((docs ?? 0) + (items ?? 0) > 0) throw new Error("Esta conta possui lançamentos em NF-e. Inative em vez de excluir.");
    const { error } = await (context.supabase as any).from("plano_contas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
