import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { cooldownException, cooldownMessage, ExternalRateLimitError } from "@/common/sync-feedback";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { NacionalAdnNfseProvider } from "./nacional-adn-nfse.provider";

@Injectable()
export class NfseSyncService {
  constructor(private readonly nacional: NacionalAdnNfseProvider) {}

  async test(companyId: string) {
    const current = await supabaseAdmin
      .from("empresa_integracoes_fiscais")
      .select("nfse_next_allowed_sync_at")
      .eq("company_id", companyId)
      .single();
    if (current.error) throw current.error;
    const nextAllowed = current.data.nfse_next_allowed_sync_at
      ? new Date(current.data.nfse_next_allowed_sync_at)
      : null;
    if (nextAllowed && nextAllowed > new Date())
      throw cooldownException("O Ambiente de Dados Nacional da NFS-e", nextAllowed);
    const result = await this.nacional.test(companyId);
    if (!result.ok && result.retryAt) {
      await supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .update({ nfse_next_allowed_sync_at: result.retryAt, nfse_last_error: result.message })
        .eq("company_id", companyId);
    }
    return result;
  }

  async sync(companyId: string) {
    const integration = await supabaseAdmin
      .from("empresa_integracoes_fiscais")
      .select("organization_id, ativo, nfse_provider, nfse_last_nsu, nfse_next_allowed_sync_at")
      .eq("company_id", companyId)
      .single();
    if (integration.error) throw integration.error;
    if (!integration.data.ativo)
      throw new ServiceUnavailableException(
        "A integração fiscal está desativada para esta empresa. Ative-a antes de sincronizar NFS-e.",
      );
    if (integration.data.nfse_provider !== "nacional_adn")
      throw new ServiceUnavailableException(
        `O provedor ${integration.data.nfse_provider} precisa de uma configuração municipal específica antes de ser utilizado.`,
      );
    const nextAllowed = integration.data.nfse_next_allowed_sync_at
      ? new Date(integration.data.nfse_next_allowed_sync_at)
      : null;
    if (nextAllowed && nextAllowed > new Date())
      throw cooldownException("O Ambiente de Dados Nacional da NFS-e", nextAllowed);

    const limit = Math.min(Math.max(Number(process.env.NFSE_ADN_BATCH_SIZE ?? 20), 1), 100);
    let lastNsu = Number(integration.data.nfse_last_nsu ?? 0);
    let imported = 0;
    try {
      for (let count = 0; count < limit; count += 1) {
        const document = await this.nacional.fetch(companyId, lastNsu + 1);
        if (!document) break;
        const saved = await supabaseAdmin.from("nfse_distribution_documents").upsert(
          {
            organization_id: integration.data.organization_id,
            company_id: companyId,
            provider: this.nacional.kind,
            nsu: document.nsu,
            access_key: document.accessKey,
            content_type: document.contentType,
            raw_document: document.rawDocument,
            payload_hash: document.payloadHash,
          },
          { onConflict: "company_id,provider,nsu" },
        );
        if (saved.error) throw saved.error;
        lastNsu = document.nsu;
        imported += 1;
      }
      const now = new Date().toISOString();
      await supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .update({
          nfse_last_nsu: lastNsu,
          nfse_last_sync_at: now,
          nfse_last_error: null,
          nfse_next_allowed_sync_at: null,
        })
        .eq("company_id", companyId);
      const message = imported
        ? `${imported} documento(s) NFS-e recebido(s) com sucesso.`
        : "Consulta concluída. Nenhuma NFS-e nova foi localizada; a sincronização automática continuará no intervalo configurado.";
      await supabaseAdmin.from("historico_integracao_fiscal").insert({
        organization_id: integration.data.organization_id,
        company_id: companyId,
        acao: "sync_nfse_distribuicao",
        sucesso: true,
        mensagem: message,
        payload_bruto: { provider: this.nacional.kind, last_nsu: lastNsu, imported },
      });
      return { provider: this.nacional.kind, imported, lastNsu, message };
    } catch (error) {
      const message =
        error instanceof ExternalRateLimitError
          ? cooldownMessage(error.source, error.retryAt)
          : error instanceof Error
            ? error.message
            : "Não foi possível consultar NFS-e. A sincronização automática tentará novamente no próximo ciclo.";
      await supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .update({
          nfse_last_sync_at: new Date().toISOString(),
          nfse_last_error: message,
          ...(error instanceof ExternalRateLimitError
            ? { nfse_next_allowed_sync_at: error.retryAt.toISOString() }
            : {}),
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
          last_nsu: lastNsu,
          retry_at: error instanceof ExternalRateLimitError ? error.retryAt.toISOString() : null,
        },
      });
      if (error instanceof ExternalRateLimitError)
        throw cooldownException(error.source, error.retryAt);
      throw error;
    }
  }
}
