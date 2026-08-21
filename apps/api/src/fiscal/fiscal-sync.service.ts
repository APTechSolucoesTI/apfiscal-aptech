import { ConflictException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DistributionCheckpoint, NfeProvider, NfeProviderKind } from "@apfiscal/shared";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ApfiscalProvider } from "./providers/apfiscal.provider";
import { NfeWizardProvider } from "./providers/nfewizard.provider";
import { ProviderPreparationError } from "./provider-preparation.error";
import { availableFallback, missingProviderMessage, providerConfigured, type ProviderRoutingConfig } from "./provider-routing";
import { importarNfeXml } from "@/legacy/lib/nfe-import.server";

type IntegrationConfig = ProviderRoutingConfig & {
  organization_id: string;
  ativo: boolean;
};

function accessKey(xml: string): string | null {
  return xml.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1] ?? xml.match(/\bNFe(\d{44})\b/)?.[1] ?? null;
}

@Injectable()
export class FiscalSyncService {
  constructor(
    private readonly nfeWizard: NfeWizardProvider,
    private readonly apfiscal: ApfiscalProvider,
  ) {}

  provider(kind: NfeProviderKind): NfeProvider {
    return kind === "nfewizard" ? this.nfeWizard : this.apfiscal;
  }

  private async config(companyId: string): Promise<IntegrationConfig> {
    const result = await supabaseAdmin.from("empresa_integracoes_fiscais")
      .select("primary_provider, fallback_provider, fallback_enabled, organization_id, ativo, certificate_storage_path, certificate_password_encrypted, api_key_encrypted")
      .eq("company_id", companyId).single();
    if (result.error) throw result.error;
    return result.data as IntegrationConfig;
  }

  async test(companyId: string, requestedProvider?: NfeProviderKind) {
    const config = await this.config(companyId);
    const kind = requestedProvider ?? config.primary_provider;
    if (!config.ativo) throw new ServiceUnavailableException("A integração fiscal está desativada para esta empresa.");
    if (!providerConfigured(config, kind)) throw new ProviderPreparationError(missingProviderMessage(kind));
    return { provider: kind, ...(await this.provider(kind).testConnection(companyId)) };
  }

  async sync(companyId: string) {
    const startedAt = Date.now();
    const workerId = randomUUID();
    const lock = await supabaseAdmin.rpc("try_acquire_fiscal_sync_lock", { _company_id: companyId, _worker_id: workerId });
    if (lock.error) throw lock.error;
    if (!lock.data) throw new ConflictException("Já existe uma sincronização em andamento para esta empresa.");
    const lockToken = String(lock.data);
    let auditOrganizationId: string | null = null;
    let auditProvider: NfeProviderKind | null = null;
    let auditLastNsu: string | null = null;
    try {
      const [config, stateResult] = await Promise.all([
        this.config(companyId),
        supabaseAdmin.from("fiscal_distribution_state").select("company_id, cnpj, last_nsu, next_allowed_sync_at").eq("company_id", companyId).single(),
      ]);
      if (stateResult.error) throw stateResult.error;
      auditOrganizationId = config.organization_id;
      auditLastNsu = String(stateResult.data.last_nsu);
      if (!config.ativo) throw new ServiceUnavailableException("A integração fiscal está desativada para esta empresa.");
      if (!providerConfigured(config, config.primary_provider)) {
        throw new ProviderPreparationError(missingProviderMessage(config.primary_provider));
      }
      const nextAllowed = stateResult.data.next_allowed_sync_at ? new Date(stateResult.data.next_allowed_sync_at) : null;
      if (nextAllowed && nextAllowed > new Date()) {
        throw new HttpException(`A SEFAZ permite a próxima consulta após ${nextAllowed.toLocaleString("pt-BR")}.`, HttpStatus.TOO_MANY_REQUESTS);
      }
      const checkpoint: DistributionCheckpoint = {
        companyId,
        cnpj: String(stateResult.data.cnpj),
        lastNsu: String(stateResult.data.last_nsu),
        nextAllowedSyncAt: stateResult.data.next_allowed_sync_at,
      };

      let usedProvider = config.primary_provider;
      auditProvider = usedProvider;
      let result;
      try {
        result = await this.provider(usedProvider).syncDistribution(checkpoint);
      } catch (error) {
        const fallback = availableFallback(config, usedProvider, error);
        if (!fallback) throw error;
        usedProvider = fallback;
        auditProvider = usedProvider;
        result = await this.provider(usedProvider).syncDistribution(checkpoint);
      }

      let persisted = 0;
      let imported = 0;
      for (const document of result.documents) {
        const chave = accessKey(document.xml);
        if (!chave) continue;
        const isFull = /procNFe|nfeProc/i.test(document.schema);
        const path = `${companyId}/${document.nsu}-${isFull ? "completa" : "resumida"}-${chave}.xml`;
        const upload = await supabaseAdmin.storage.from("fiscal-xml").upload(path, Buffer.from(document.xml), { contentType: "application/xml", upsert: true });
        if (upload.error) throw upload.error;
        const upsert = await supabaseAdmin.from("documentos_fiscais_integracao").upsert({
          organization_id: config.organization_id,
          company_id: companyId,
          nsu: Number(document.nsu),
          chave,
          tipo_documento: document.schema,
          status: isFull ? "completa" : "resumida",
          ...(isFull ? { xml_completo_path: path } : { xml_resumido_path: path }),
        }, { onConflict: "company_id,chave" });
        if (upsert.error) throw upsert.error;
        if (isFull) {
          const canonical = await importarNfeXml(supabaseAdmin, { fileName: path, xml: document.xml });
          if (canonical.ok) imported++;
          if (canonical.documentId) {
            await supabaseAdmin.from("fiscal_documents")
              .update({ source_provider: usedProvider })
              .eq("id", canonical.documentId)
              .is("source_provider", null);
          }
        }
        persisted++;
      }

      const cooldownHours = ["137", "656"].includes(result.cStat) ? 1 : 0;
      const update = await supabaseAdmin.from("fiscal_distribution_state").update({
        last_nsu: Number(result.lastNsu),
        last_sync_at: new Date().toISOString(),
        next_allowed_sync_at: cooldownHours ? new Date(Date.now() + cooldownHours * 3_600_000).toISOString() : null,
        last_cstat: result.cStat,
        last_error: ["137", "138"].includes(result.cStat) ? null : result.xMotivo,
      }).eq("company_id", companyId).eq("lock_token", lockToken);
      if (update.error) throw update.error;
      await supabaseAdmin.from("empresa_integracoes_fiscais").update({ ultimo_nsu: Number(result.lastNsu) }).eq("company_id", companyId);
      await supabaseAdmin.from("historico_integracao_fiscal").insert({
        organization_id: config.organization_id,
        company_id: companyId,
        acao: "sync_distribuicao",
        sucesso: true,
        mensagem: result.xMotivo,
        payload_bruto: {
          provider: usedProvider,
          duration_ms: Date.now() - startedAt,
          cstat: result.cStat,
          last_nsu_before: checkpoint.lastNsu,
          last_nsu_after: result.lastNsu,
          documents_found: result.documents.length,
          documents_imported: persisted,
          canonical_notes_imported: imported,
        },
      });
      return {
        provider: usedProvider,
        cStat: result.cStat,
        message: result.xMotivo,
        documents: persisted,
        lastNsu: result.lastNsu,
        novosDocumentos: persisted,
        xmlsResumidosBaixados: result.documents.filter((document) => !/procNFe|nfeProc/i.test(document.schema)).length,
        xmlsCompletosBaixados: result.documents.filter((document) => /procNFe|nfeProc/i.test(document.schema)).length,
        notasImportadas: imported,
        ultimoNsu: Number(result.lastNsu),
        erros: [] as Array<{ chave?: string; nsu?: number; mensagem: string }>,
      };
    } catch (error) {
      if (auditOrganizationId) {
        await supabaseAdmin.from("historico_integracao_fiscal").insert({
          organization_id: auditOrganizationId,
          company_id: companyId,
          acao: "sync_distribuicao",
          sucesso: false,
          mensagem: error instanceof Error ? error.message : "Falha não identificada na sincronização.",
          payload_bruto: {
            provider: auditProvider,
            duration_ms: Date.now() - startedAt,
            last_nsu_before: auditLastNsu,
          },
        });
      }
      throw error;
    } finally {
      await supabaseAdmin.rpc("release_fiscal_sync_lock", { _company_id: companyId, _lock_token: lockToken });
    }
  }
}
