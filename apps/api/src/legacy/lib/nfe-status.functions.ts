import { createApiAction } from "@/common/action-builder";
import { verifyPassword } from "@/auth/password";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { NfeStatus } from "./nfe-status";

async function getDocOrThrow(context: any, documentId: string) {
  const { data: doc, error } = await context.supabase
    .from("fiscal_documents")
    .select(
      "id, company_id, tipo, status, valor_total, plano_contas_id, local_estoque_id, tipo_movimento_id, companies(organization_id)",
    )
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!doc) throw new Error("Documento fiscal não encontrado ou sem acesso.");
  return doc as any;
}

async function assertAprovador(context: any, organizationId: string) {
  const { data, error } = await context.supabase.rpc("has_org_role", {
    _org_id: organizationId,
    _roles: ["admin", "financeiro"],
  } as any);
  if (error) throw new Error(error.message);
  if (!data)
    throw new Error("Você não tem permissão para alterar o status deste documento fiscal.");
}

async function updateStatus(
  context: any,
  documentId: string,
  status: NfeStatus,
  observacao: string,
) {
  const { error } = await context.supabase
    .from("fiscal_documents")
    .update({
      status,
      status_updated_by: context.userId,
      status_updated_at: new Date().toISOString(),
      status_observacao: observacao,
    } as any)
    .eq("id", documentId);
  if (error) throw new Error(error.message);
}

/** Aprova a NF-e após reautenticação (senha da conta atual validada no servidor). */
export const aprovarNfe = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; email: string; password: string }) => data)
  .handler(async ({ data, context }) => {
    if (!data.email?.trim() || !data.password) throw new Error("Informe usuário e senha.");

    const credential = await supabaseAdmin
      .from("users")
      .select("id, password_hash, active")
      .ilike("email", data.email.trim().toLowerCase())
      .maybeSingle();
    if (
      credential.error ||
      !credential.data ||
      credential.data.id !== context.userId ||
      !credential.data.active ||
      !(await verifyPassword(data.password, credential.data.password_hash))
    ) {
      throw new Error("As credenciais informadas não são da conta atual.");
    }

    const doc = await getDocOrThrow(context, data.documentId);
    await assertAprovador(context, doc.companies.organization_id);
    if (doc.status !== "pendente_confirmacao")
      throw new Error("Este documento fiscal já foi aprovado.");

    await updateStatus(
      context,
      data.documentId,
      "aprovada",
      `Aprovação de ${doc.tipo === "nfse" ? "NFS-e" : "NF-e"} confirmada via modal de aprovação`,
    );
    return { ok: true };
  });

/** Reavalia apontamentos e promove aprovada -> pronta_para_integracao quando completos. */
export const reavaliarStatusApontamentos = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) => data)
  .handler(async ({ data, context }) => {
    const status = await reavaliarApontamentos(context, data.documentId);
    return { ok: true, status };
  });

export async function reavaliarApontamentos(
  context: any,
  documentId: string,
): Promise<string | null> {
  const doc = await getDocOrThrow(context, documentId);
  if (doc.status !== "aprovada" && doc.status !== "pronta_para_integracao") return doc.status;

  const { data: headerAllocations, count } = await context.supabase
    .from("nfe_centro_custo")
    .select("id, valor", { count: "exact" })
    .eq("document_id", documentId);
  const nfseAllocationTotal = (headerAllocations ?? []).reduce(
    (total: number, allocation: { valor: number | string }) => total + Number(allocation.valor),
    0,
  );
  const nfseAllocationClosed =
    (count ?? 0) > 0 && Math.abs(nfseAllocationTotal - Number(doc.valor_total ?? 0)) <= 0.005;

  // Todos os itens precisam ter Tipo de Compra apontado
  const { count: itensSemTipo } = await (context.supabase as any)
    .from("fiscal_document_items")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .is("tipo_compra_id", null);

  const { count: itensSemProduto } = await context.supabase
    .from("fiscal_document_items")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .is("product_id", null);

  const completo =
    doc.tipo === "nfse"
      ? !!doc.tipo_movimento_id && !!doc.plano_contas_id && nfseAllocationClosed
      : !!doc.tipo_movimento_id &&
        !!doc.plano_contas_id &&
        !!doc.local_estoque_id &&
        (count ?? 0) > 0 &&
        (itensSemTipo ?? 0) === 0 &&
        (itensSemProduto ?? 0) === 0;
  const alvo: NfeStatus = completo ? "pronta_para_integracao" : "aprovada";
  const observacao = completo
    ? doc.tipo === "nfse"
      ? "Apontamentos obrigatórios concluídos (Tipo de Movimento, Plano de Contas e Centro de Custo)"
      : "Apontamentos obrigatórios concluídos (Tipo de Movimento, Plano de Contas, Local de Estoque, Centro de Custo e Tipo de Compra)"
    : (itensSemProduto ?? 0) > 0 &&
        !!doc.tipo_movimento_id &&
        !!doc.plano_contas_id &&
        !!doc.local_estoque_id &&
        (count ?? 0) > 0 &&
        (itensSemTipo ?? 0) === 0
      ? `A única pendência é vincular ${itensSemProduto} produto(s) ao fornecedor.`
      : (itensSemTipo ?? 0) > 0
        ? `Existem ${itensSemTipo} item(ns) sem Tipo de Compra apontado.`
        : !doc.tipo_movimento_id
          ? "Selecione o Tipo de Movimento para concluir os apontamentos."
          : "Apontamentos obrigatórios incompletos";
  if (alvo !== doc.status) {
    await updateStatus(context, documentId, alvo, observacao);
  } else {
    const { error } = await context.supabase
      .from("fiscal_documents")
      .update({ status_observacao: observacao, status_updated_at: new Date().toISOString() })
      .eq("id", documentId);
    if (error) throw new Error(error.message);
  }

  return alvo;
}

/** Mantido apenas para clientes antigos; confirmação manual não é permitida. */
export const marcarIntegradoTotvs = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; observacao?: string }) => data)
  .handler(() => {
    throw new Error(
      "A confirmação manual foi desativada. Use a fila TOTVS; o status só muda após sucesso transacional real no RM.",
    );
  });

export const listStatusHistorico = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("nfe_status_historico")
      .select("id, status_anterior, status_novo, alterado_por, alterado_em, observacao")
      .eq("nfe_id", data.documentId)
      .order("alterado_em", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.alterado_por).filter(Boolean)));
    const nomes: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id, email, full_name")
        .in("id", ids as string[]);
      for (const user of users ?? []) nomes[user.id] = user.full_name || user.email || "Usuário";
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      autor: r.alterado_por ? (nomes[r.alterado_por] ?? "Usuário") : "Sistema",
    }));
  });
