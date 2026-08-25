import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FiscalSyncService } from "./fiscal-sync.service";
import {
  deriveNfeLifecycle,
  MANIFESTATION_EVENT,
  manifestationAccepted,
  type ManifestationKind,
} from "./nfe-lifecycle";

type ManifestInput = {
  companyId: string;
  accessKey: string;
  event: ManifestationKind;
  justification?: string;
  userId: string;
};

function json(value: unknown): Json | null {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as Json;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Falha não identificada no envio do evento.";
}

@Injectable()
export class NfeManifestationService {
  constructor(private readonly sync: FiscalSyncService) {}

  private async context(companyId: string, accessKey: string) {
    const [integration, summary, canonical] = await Promise.all([
      supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .select("organization_id, primary_provider")
        .eq("company_id", companyId)
        .single(),
      supabaseAdmin
        .from("documentos_fiscais_integracao")
        .select("id, xml_completo_path, situacao, protocolo")
        .eq("company_id", companyId)
        .eq("chave", accessKey)
        .maybeSingle(),
      supabaseAdmin
        .from("fiscal_documents")
        .select("id")
        .eq("company_id", companyId)
        .eq("chave_acesso", accessKey)
        .maybeSingle(),
    ]);
    if (integration.error) throw integration.error;
    if (summary.error) throw summary.error;
    if (canonical.error) throw canonical.error;
    if (!summary.data && !canonical.data)
      throw new NotFoundException("NF-e não encontrada para esta empresa.");
    if (!summary.data)
      throw new BadRequestException(
        "Esta NF-e já está completa e deve ser tratada na aba de NF-e completas.",
      );
    return {
      organizationId: integration.data.organization_id,
      provider: integration.data.primary_provider,
      summary: summary.data,
      canonicalId: canonical.data?.id ?? null,
    };
  }

  async manifest(input: ManifestInput) {
    if (input.event === "nao_realizada" && (input.justification?.trim().length ?? 0) < 15)
      throw new BadRequestException("Informe uma justificativa com pelo menos 15 caracteres.");
    const context = await this.context(input.companyId, input.accessKey);
    const event = MANIFESTATION_EVENT[input.event];
    const previous = await supabaseAdmin
      .from("manifestations")
      .select("id, status, response_cstat, response_xmotivo, protocolo, event_at")
      .eq("company_id", input.companyId)
      .eq("access_key", input.accessKey)
      .eq("tipo", input.event)
      .eq("sequence", 1)
      .maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data && manifestationAccepted(previous.data.response_cstat)) {
      return {
        ...previous.data,
        cStat: previous.data.response_cstat,
        xMotivo: previous.data.response_xmotivo,
        accepted: true,
        idempotent: true,
      };
    }

    const requestPayload = {
      accessKey: input.accessKey,
      event: input.event,
      tpEvento: event.code,
      justification: input.justification?.trim() || null,
    };
    const base = {
      organization_id: context.organizationId,
      company_id: input.companyId,
      integration_document_id: context.summary.id,
      fiscal_document_id: context.canonicalId,
      access_key: input.accessKey,
      tipo: input.event,
      tp_evento: event.code,
      descricao_evento: event.description,
      sequence: 1,
      usuario_id: input.userId,
      provider: context.provider,
      source: "user",
      status: "requested",
      requested_at: new Date().toISOString(),
      request_payload: json(requestPayload),
      response_cstat: null,
      response_xmotivo: null,
      response_payload: null,
      protocolo: null,
      event_at: null,
    };
    const pending = previous.data
      ? await supabaseAdmin.from("manifestations").update(base).eq("id", previous.data.id).select("id").single()
      : await supabaseAdmin.from("manifestations").insert(base).select("id").single();
    if (pending.error) throw pending.error;

    try {
      const result = await this.sync.provider(context.provider).manifest({
        companyId: input.companyId,
        accessKey: input.accessKey,
        event: input.event,
        justification: input.justification,
      });
      const accepted = manifestationAccepted(result.cStat);
      const persisted = await supabaseAdmin
        .from("manifestations")
        .update({
          status: accepted ? "accepted" : "rejected",
          response_cstat: result.cStat,
          response_xmotivo: result.xMotivo,
          response_payload: json(result.rawResponse),
          protocolo: result.protocol ?? null,
          event_at: result.eventAt ?? new Date().toISOString(),
        })
        .eq("id", pending.data.id);
      if (persisted.error) throw persisted.error;

      const nextStatus = accepted && ["ciencia", "confirmacao"].includes(input.event)
        ? "aguardando_xml_completo"
        : accepted
          ? "resumida"
          : "manifestacao_pendente";
      const summaryUpdate = await supabaseAdmin
        .from("documentos_fiscais_integracao")
        .update({
          status: nextStatus,
          status_manifestacao: accepted ? input.event : null,
          protocolo: result.protocol ?? context.summary.protocolo,
          mensagem_sefaz: accepted ? null : `${result.cStat} — ${result.xMotivo}`,
          ultima_sincronizacao: new Date().toISOString(),
        })
        .eq("id", context.summary.id)
        .is("xml_completo_path", null);
      if (summaryUpdate.error) throw summaryUpdate.error;

      let refresh: { attempted: boolean; completed: boolean; message?: string } = {
        attempted: false,
        completed: false,
      };
      if (accepted && ["ciencia", "confirmacao"].includes(input.event)) {
        refresh = { attempted: true, completed: false };
        try {
          const reconciliation = await this.sync.refreshDocument(input.companyId, input.accessKey);
          refresh = { attempted: true, completed: reconciliation.fullXmlDownloaded > 0 };
        } catch (error) {
          refresh.message = errorMessage(error);
        }
      }
      await supabaseAdmin.from("historico_integracao_fiscal").insert({
        organization_id: context.organizationId,
        company_id: input.companyId,
        documento_id: context.summary.id,
        acao: "manifestacao_nfe",
        sucesso: accepted,
        mensagem: `${event.description}: ${result.cStat} — ${result.xMotivo}`,
        payload_bruto: json({ event: input.event, tpEvento: event.code, refresh }),
      });
      return {
        ...result,
        accepted,
        idempotent: false,
        refresh,
        lifecycle: deriveNfeLifecycle({
          hasFullXml: refresh.completed,
          situation: context.summary.situacao,
          acceptedEvents: accepted ? [input.event] : [],
        }),
      };
    } catch (error) {
      await supabaseAdmin
        .from("manifestations")
        .update({ status: "error", response_xmotivo: errorMessage(error) })
        .eq("id", pending.data.id);
      throw error;
    }
  }

  async manifestBatch(input: {
    companyId: string;
    documents: Array<{ accessKey: string; event: ManifestationKind; justification?: string }>;
    userId: string;
  }) {
    const results: Array<{
      accessKey: string;
      success: boolean;
      accepted?: boolean;
      cStat?: string;
      message: string;
      idempotent?: boolean;
    }> = [];
    // Dois eventos simultâneos evitam bombardear o WebService sem tornar o lote opaco.
    for (let index = 0; index < input.documents.length; index += 2) {
      const batch = input.documents.slice(index, index + 2);
      results.push(
        ...(await Promise.all(
          batch.map(async (document) => {
            try {
              const result = await this.manifest({
                companyId: input.companyId,
                accessKey: document.accessKey,
                event: document.event,
                justification: document.justification,
                userId: input.userId,
              });
              return {
                accessKey: document.accessKey,
                success: true,
                accepted: result.accepted ?? true,
                cStat: result.cStat ?? undefined,
                message: result.xMotivo ?? "Manifestação processada.",
                idempotent: result.idempotent,
              };
            } catch (error) {
              return { accessKey: document.accessKey, success: false, message: errorMessage(error) };
            }
          }),
        )),
      );
    }
    return {
      total: results.length,
      processed: results.filter(
        (result) => result.success && result.accepted === true && !result.idempotent,
      ).length,
      idempotent: results.filter((result) => result.idempotent).length,
      failed: results.filter((result) => !result.success || result.accepted === false).length,
      results,
    };
  }
}
