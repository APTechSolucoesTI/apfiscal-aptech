import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reavaliarApontamentos } from "./nfe-status.functions";

type DocumentType = "nfe" | "nfse";

export const listTiposMovimento = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { companyId: string; tipoDocumento?: DocumentType; apenasVinculados?: boolean }) => data,
  )
  .handler(async ({ data, context }) => {
    const movements = await context.supabase
      .from("tipos_movimento_totvs")
      .select("id, company_id, codigo, descricao, ativo, coligada_id")
      .eq("company_id", data.companyId)
      .eq("ativo", true)
      .order("codigo");
    if (movements.error) throw new Error(movements.error.message);
    const ids = (movements.data ?? []).map((movement) => movement.id);
    const links = ids.length
      ? await context.supabase
          .from("tipos_movimento_documentos")
          .select("tipo_movimento_id, tipo_documento")
          .in("tipo_movimento_id", ids)
      : { data: [], error: null };
    if (links.error) throw new Error(links.error.message);
    const linked = new Map<string, Set<string>>();
    for (const link of links.data ?? []) {
      const types = linked.get(link.tipo_movimento_id) ?? new Set<string>();
      types.add(link.tipo_documento);
      linked.set(link.tipo_movimento_id, types);
    }
    return (movements.data ?? [])
      .map((movement) => ({
        ...movement,
        tipos_documento: [...(linked.get(movement.id) ?? [])],
        vinculado: data.tipoDocumento
          ? Boolean(linked.get(movement.id)?.has(data.tipoDocumento))
          : false,
      }))
      .filter((movement) => !data.apenasVinculados || movement.vinculado);
  });

export const setTipoMovimentoDocumento = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { tipoMovimentoId: string; tipoDocumento: DocumentType; vinculado: boolean }) => data,
  )
  .handler(async ({ data, context }) => {
    const movement = await context.supabase
      .from("tipos_movimento_totvs")
      .select("id, organization_id")
      .eq("id", data.tipoMovimentoId)
      .single();
    if (movement.error) throw new Error(movement.error.message);
    if (data.vinculado) {
      const saved = await context.supabase.from("tipos_movimento_documentos").upsert(
        {
          organization_id: movement.data.organization_id,
          tipo_movimento_id: data.tipoMovimentoId,
          tipo_documento: data.tipoDocumento,
        },
        { onConflict: "tipo_movimento_id,tipo_documento" },
      );
      if (saved.error) throw new Error(saved.error.message);
    } else {
      const removed = await context.supabase
        .from("tipos_movimento_documentos")
        .delete()
        .eq("tipo_movimento_id", data.tipoMovimentoId)
        .eq("tipo_documento", data.tipoDocumento);
      if (removed.error) throw new Error(removed.error.message);
    }
    return { ok: true };
  });

export const setTipoMovimentoFiscal = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; tipoMovimentoId: string | null }) => data)
  .handler(async ({ data, context }) => {
    const document = await context.supabase
      .from("fiscal_documents")
      .select("id, company_id, tipo, status")
      .eq("id", data.documentId)
      .single();
    if (document.error) throw new Error(document.error.message);
    if (["integrado_totvs", "ja_existente_totvs"].includes(document.data.status))
      throw new Error("Documento já existente no TOTVS é somente para visualização.");
    if (data.tipoMovimentoId) {
      const movement = await context.supabase
        .from("tipos_movimento_totvs")
        .select("id, company_id, tipos_movimento_documentos!inner(tipo_documento)")
        .eq("id", data.tipoMovimentoId)
        .eq("company_id", document.data.company_id)
        .eq("tipos_movimento_documentos.tipo_documento", document.data.tipo)
        .maybeSingle();
      if (movement.error || !movement.data)
        throw new Error("Tipo de Movimento não está vinculado a este documento fiscal.");
    }
    const saved = await context.supabase
      .from("fiscal_documents")
      .update({ tipo_movimento_id: data.tipoMovimentoId })
      .eq("id", data.documentId);
    if (saved.error) throw new Error(saved.error.message);
    await reavaliarApontamentos(context, data.documentId);
    return { ok: true };
  });
