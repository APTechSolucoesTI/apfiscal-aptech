import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LocalEstoqueInput = {
  id?: string;
  company_id: string | null;
  codigo: string;
  descricao: string;
  ativo?: boolean;
};

const SINTETICO_RE = /^\d{2}$/;
const ANALITICO_RE = /^\d{2}\.\d{3}$/;

export function tipoDoCodigoLocal(codigo: string): "sintetico" | "analitico" {
  return ANALITICO_RE.test(codigo) ? "analitico" : "sintetico";
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

export const listLocaisEstoque = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId?: string; apenasAtivos?: boolean }) => data)
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any).from("locais_estoque").select("*").order("codigo");
    if (data.companyId) q = q.or(`company_id.eq.${data.companyId},company_id.is.null`);
    if (data.apenasAtivos) q = q.eq("ativo", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const saveLocalEstoque = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: LocalEstoqueInput) => {
    const codigo = (data.codigo ?? "").trim();
    if (!SINTETICO_RE.test(codigo) && !ANALITICO_RE.test(codigo)) {
      throw new Error("Formato inválido. Use 99 (sintético) ou 99.999 (analítico)");
    }
    if (!data.descricao?.trim()) throw new Error("Descrição é obrigatória");
    return { ...data, codigo };
  })
  .handler(async ({ data, context }) => {
    const organization_id = await orgIdOf(context, data.company_id ?? null);
    const tipo = tipoDoCodigoLocal(data.codigo);
    const company_id = data.company_id ?? null;

    // Escopo (empresa específica ou global)
    const scopeFilter = (q: any) => (company_id ? q.eq("company_id", company_id) : q.is("company_id", null));

    let codigo_pai_id: string | null = null;
    if (tipo === "analitico") {
      const prefixo = data.codigo.split(".")[0];
      const { data: pai, error: paiErr } = await scopeFilter(
        (context.supabase as any).from("locais_estoque")
          .select("id").eq("organization_id", organization_id).eq("codigo", prefixo)
      ).maybeSingle();
      if (paiErr) throw new Error(paiErr.message);
      if (!pai) throw new Error(`Local de estoque sintético "${prefixo}" não existe. Cadastre-o antes.`);
      codigo_pai_id = pai.id as string;
    }

    // Duplicidade
    const { data: dup, error: dupErr } = await scopeFilter(
      (context.supabase as any).from("locais_estoque")
        .select("id").eq("organization_id", organization_id).eq("codigo", data.codigo)
    ).maybeSingle();
    if (dupErr) throw new Error(dupErr.message);
    if (dup && dup.id !== data.id) throw new Error(`Já existe um Local de Estoque com o código ${data.codigo}`);

    const payload = {
      organization_id,
      company_id,
      codigo: data.codigo,
      tipo,
      codigo_pai_id,
      descricao: data.descricao.trim(),
      ativo: data.ativo ?? true,
    };

    if (data.id) {
      const { error } = await (context.supabase as any)
        .from("locais_estoque").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await (context.supabase as any)
      .from("locais_estoque").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const toggleLocalEstoqueAtivo = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; ativo: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("locais_estoque").update({ ativo: data.ativo }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLocalEstoque = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { count } = await (context.supabase as any)
      .from("locais_estoque").select("id", { count: "exact", head: true }).eq("codigo_pai_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("Este Local de Estoque possui locais analíticos vinculados. Exclua-os primeiro ou inative o registro.");
    }
    const { error } = await (context.supabase as any).from("locais_estoque").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
