import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { NacionalAdnNfseProvider } from "./nacional-adn-nfse.provider";

@Injectable()
export class NfseSyncService {
  constructor(private readonly nacional: NacionalAdnNfseProvider) {}

  async test(companyId: string) { return this.nacional.test(companyId); }

  async sync(companyId: string) {
    const integration = await supabaseAdmin.from("empresa_integracoes_fiscais")
      .select("organization_id, ativo, nfse_provider, nfse_last_nsu").eq("company_id", companyId).single();
    if (integration.error) throw integration.error;
    if (!integration.data.ativo) throw new ServiceUnavailableException("A integração fiscal está desativada para esta empresa.");
    if (integration.data.nfse_provider !== "nacional_adn") throw new ServiceUnavailableException(`O adapter ${integration.data.nfse_provider} ainda exige configuração municipal específica.`);
    const limit = Math.min(Math.max(Number(process.env.NFSE_ADN_BATCH_SIZE ?? 20), 1), 100);
    let lastNsu = Number(integration.data.nfse_last_nsu ?? 0);
    let imported = 0;
    try {
      for (let count = 0; count < limit; count += 1) {
        const document = await this.nacional.fetch(companyId, lastNsu + 1);
        if (!document) break;
        const saved = await supabaseAdmin.from("nfse_distribution_documents").upsert({
          organization_id: integration.data.organization_id, company_id: companyId, provider: this.nacional.kind,
          nsu: document.nsu, access_key: document.accessKey, content_type: document.contentType, raw_document: document.rawDocument, payload_hash: document.payloadHash,
        }, { onConflict: "company_id,provider,nsu" });
        if (saved.error) throw saved.error;
        lastNsu = document.nsu;
        imported += 1;
      }
      const now = new Date().toISOString();
      await supabaseAdmin.from("empresa_integracoes_fiscais").update({ nfse_last_nsu: lastNsu, nfse_last_sync_at: now, nfse_last_error: null }).eq("company_id", companyId);
      await supabaseAdmin.from("historico_integracao_fiscal").insert({ organization_id: integration.data.organization_id, company_id: companyId, acao: "sync_nfse_distribuicao", sucesso: true, mensagem: `${imported} documento(s) recebido(s) do ADN.`, payload_bruto: { provider: this.nacional.kind, last_nsu: lastNsu, imported } });
      return { provider: this.nacional.kind, imported, lastNsu };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na distribuição NFS-e.";
      await supabaseAdmin.from("empresa_integracoes_fiscais").update({ nfse_last_sync_at: new Date().toISOString(), nfse_last_error: message }).eq("company_id", companyId);
      await supabaseAdmin.from("historico_integracao_fiscal").insert({ organization_id: integration.data.organization_id, company_id: companyId, acao: "sync_nfse_distribuicao", sucesso: false, mensagem: message, payload_bruto: { provider: this.nacional.kind, last_nsu: lastNsu } });
      throw error;
    }
  }
}
