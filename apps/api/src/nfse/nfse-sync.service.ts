import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { cooldownException, cooldownMessage, ExternalRateLimitError } from "@/common/sync-feedback";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseAdnBatch } from "./nfse-adn-parser";
import { parseNfseXml } from "./nfse-document-parser";
import type { NfseBatch, NfseDocument } from "./nfse-provider";
import { NacionalAdnNfseProvider } from "./nacional-adn-nfse.provider";

type SyncCounters = {
  located: number;
  relevant: number;
  imported: number;
  duplicates: number;
  ignored: number;
  errors: string[];
  lastNsu: number;
};

function emptyCounters(lastNsu: number): SyncCounters {
  return {
    located: 0,
    relevant: 0,
    imported: 0,
    duplicates: 0,
    ignored: 0,
    errors: [],
    lastNsu,
  };
}

function taxId(value: string): string {
  return value.replace(/\D/g, "");
}

function safeIntervalMinutes(): number {
  const configured = Number(process.env.NFSE_ADN_MIN_INTERVAL_MINUTES ?? 15);
  return Number.isInteger(configured) ? Math.min(Math.max(configured, 15), 1440) : 15;
}

@Injectable()
export class NfseSyncService {
  constructor(private readonly nacional: NacionalAdnNfseProvider) {}

  async test(companyId: string) {
    const result = await this.nacional.test(companyId);
    if (!result.ok && result.retryAt) {
      await supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .update({ nfse_next_allowed_sync_at: result.retryAt, nfse_last_error: result.message })
        .eq("company_id", companyId);
    }
    return result;
  }

  private async persistDocument(input: {
    organizationId: string;
    companyId: string;
    companyCnpj: string;
    document: NfseDocument;
    counters: SyncCounters;
  }) {
    const parsed = parseNfseXml(input.document.rawDocument, input.document.accessKey);
    if (!parsed.recipientTaxId || taxId(parsed.recipientTaxId) !== input.companyCnpj) {
      input.counters.ignored += 1;
      return;
    }
    input.counters.relevant += 1;
    const existing = await supabaseAdmin
      .from("fiscal_documents")
      .select("id")
      .eq("chave_acesso", parsed.accessKey)
      .maybeSingle();
    if (existing.error) throw existing.error;
    const xmlPath = `${input.companyId}/nfse/${input.document.nsu}-${parsed.accessKey}.xml`;
    const uploaded = await supabaseAdmin.storage
      .from("fiscal-xml")
      .upload(xmlPath, Buffer.from(input.document.rawDocument), {
        contentType: "application/xml",
        upsert: true,
      });
    if (uploaded.error) throw uploaded.error;
    const distributed = await supabaseAdmin.from("nfse_distribution_documents").upsert(
      {
        organization_id: input.organizationId,
        company_id: input.companyId,
        provider: this.nacional.kind,
        nsu: input.document.nsu,
        access_key: parsed.accessKey,
        content_type: input.document.contentType,
        raw_document: input.document.rawDocument,
        payload_hash: input.document.payloadHash,
      },
      { onConflict: "company_id,provider,nsu" },
    );
    if (distributed.error) throw distributed.error;
    const canonical = await supabaseAdmin.from("fiscal_documents").upsert(
      {
        company_id: input.companyId,
        tipo: "nfse",
        chave_acesso: parsed.accessKey,
        numero: parsed.number,
        serie: parsed.series,
        emitente_cnpj: parsed.issuerTaxId,
        emitente_nome: parsed.issuerName,
        destinatario_cnpj: parsed.recipientTaxId,
        destinatario_nome: parsed.recipientName,
        valor_total: parsed.total,
        valor_impostos: parsed.taxTotal,
        situacao: parsed.status,
        natureza_operacao: parsed.serviceDescription,
        data_emissao: parsed.issuedAt,
        xml_path: xmlPath,
        xml_content: input.document.rawDocument,
        source_provider: this.nacional.kind,
        raw_payload: {
          provider: this.nacional.kind,
          nsu: input.document.nsu,
          recipient_tax_id: parsed.recipientTaxId,
        },
      },
      { onConflict: "chave_acesso" },
    );
    if (canonical.error) throw canonical.error;
    if (existing.data) input.counters.duplicates += 1;
    else input.counters.imported += 1;
  }

  private async processBatch(input: {
    organizationId: string;
    companyId: string;
    companyCnpj: string;
    batch: NfseBatch;
    counters: SyncCounters;
  }): Promise<number> {
    let documentErrors = 0;
    input.counters.located += input.batch.located;
    input.counters.lastNsu = Math.max(input.counters.lastNsu, input.batch.lastNsu);
    input.counters.errors.push(...input.batch.warnings);
    for (const document of input.batch.documents) {
      try {
        await this.persistDocument({ ...input, document });
      } catch (error) {
        documentErrors += 1;
        input.counters.errors.push(
          `NSU ${document.nsu}: ${error instanceof Error ? error.message : "falha ao gravar NFS-e"}`,
        );
      }
    }
    return documentErrors;
  }

  private async expandLegacyEnvelopes(input: {
    organizationId: string;
    companyId: string;
    companyCnpj: string;
    counters: SyncCounters;
  }): Promise<boolean> {
    const legacy = await supabaseAdmin
      .from("nfse_distribution_documents")
      .select("id, raw_document")
      .eq("company_id", input.companyId)
      .ilike("content_type", "%json%");
    if (legacy.error) throw legacy.error;
    for (const row of legacy.data ?? []) {
      const batch = parseAdnBatch(Buffer.from(row.raw_document), input.counters.lastNsu);
      const documentErrors = await this.processBatch({ ...input, batch });
      if (documentErrors)
        throw new Error(
          `Não foi possível expandir ${documentErrors} documento(s) do lote ADN já recebido. O envelope original foi preservado para nova tentativa.`,
        );
      const removed = await supabaseAdmin
        .from("nfse_distribution_documents")
        .delete()
        .eq("id", row.id);
      if (removed.error) throw removed.error;
    }
    return Boolean(legacy.data?.length);
  }

  private message(counters: SyncCounters): string {
    if (!counters.located)
      return "Consulta concluída: a ADN não devolveu documentos novos para o certificado. O checkpoint foi preservado e a sincronização automática continuará ativa.";
    if (!counters.relevant)
      return `A ADN devolveu ${counters.located} registro(s), mas nenhuma NFS-e desse lote foi emitida contra o CNPJ desta empresa. O checkpoint avançou até o NSU ${counters.lastNsu} sem criar documentos incorretos.`;
    return `A ADN localizou ${counters.located} registro(s): ${counters.relevant} NFS-e pertencem a esta empresa, ${counters.imported} foram importadas e ${counters.duplicates} já existiam. Checkpoint atualizado até o NSU ${counters.lastNsu}.`;
  }

  async sync(companyId: string) {
    const [integration, company] = await Promise.all([
      supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .select("organization_id, ativo, nfse_provider, nfse_last_nsu, nfse_next_allowed_sync_at")
        .eq("company_id", companyId)
        .single(),
      supabaseAdmin.from("companies").select("cnpj").eq("id", companyId).single(),
    ]);
    if (integration.error) throw integration.error;
    if (company.error) throw company.error;
    if (!integration.data.ativo)
      throw new ServiceUnavailableException(
        "A integração fiscal está desativada para esta empresa. Ative-a antes de sincronizar NFS-e.",
      );
    if (integration.data.nfse_provider !== "nacional_adn")
      throw new ServiceUnavailableException(
        `O provedor ${integration.data.nfse_provider} precisa de uma configuração municipal específica antes de ser utilizado.`,
      );

    const counters = emptyCounters(Number(integration.data.nfse_last_nsu ?? 0));
    const common = {
      organizationId: integration.data.organization_id,
      companyId,
      companyCnpj: taxId(company.data.cnpj),
      counters,
    };
    try {
      const expanded = await this.expandLegacyEnvelopes(common);
      if (!expanded) {
        const nextAllowed = integration.data.nfse_next_allowed_sync_at
          ? new Date(integration.data.nfse_next_allowed_sync_at)
          : null;
        if (nextAllowed && nextAllowed > new Date())
          throw cooldownException("O Ambiente de Dados Nacional da NFS-e", nextAllowed);
        const batch = await this.nacional.fetch(companyId, counters.lastNsu);
        await this.processBatch({ ...common, batch });
      }

      const now = new Date();
      const retryAt = new Date(now.getTime() + safeIntervalMinutes() * 60_000);
      const message = this.message(counters);
      const updated = await supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .update({
          nfse_last_nsu: counters.lastNsu,
          nfse_last_sync_at: now.toISOString(),
          nfse_last_error: counters.errors.length ? counters.errors.slice(0, 5).join(" ") : null,
          nfse_next_allowed_sync_at: retryAt.toISOString(),
        })
        .eq("company_id", companyId);
      if (updated.error) throw updated.error;
      await supabaseAdmin.from("historico_integracao_fiscal").insert({
        organization_id: integration.data.organization_id,
        company_id: companyId,
        acao: "sync_nfse_distribuicao",
        sucesso: counters.errors.length === 0,
        mensagem: message,
        payload_bruto: {
          provider: this.nacional.kind,
          documents_located: counters.located,
          documents_for_company: counters.relevant,
          imported: counters.imported,
          duplicates: counters.duplicates,
          ignored_other_cnpj: counters.ignored,
          errors: counters.errors,
          last_nsu: counters.lastNsu,
          next_allowed_sync_at: retryAt.toISOString(),
        },
      });
      return { provider: this.nacional.kind, ...counters, message, retryAt: retryAt.toISOString() };
    } catch (error) {
      if (error instanceof ExternalRateLimitError) {
        const message = cooldownMessage(error.source, error.retryAt);
        await supabaseAdmin
          .from("empresa_integracoes_fiscais")
          .update({
            nfse_last_sync_at: new Date().toISOString(),
            nfse_last_error: message,
            nfse_next_allowed_sync_at: error.retryAt.toISOString(),
          })
          .eq("company_id", companyId);
        await supabaseAdmin.from("historico_integracao_fiscal").insert({
          organization_id: integration.data.organization_id,
          company_id: companyId,
          acao: "sync_nfse_distribuicao",
          sucesso: false,
          mensagem: message,
          payload_bruto: {
            provider: this.nacional.kind,
            documents_located: counters.located,
            imported: counters.imported,
            last_nsu: counters.lastNsu,
            retry_at: error.retryAt.toISOString(),
          },
        });
        throw cooldownException(error.source, error.retryAt);
      }
      throw error;
    }
  }
}
