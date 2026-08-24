import { Injectable, Logger } from "@nestjs/common";
import NFeWizard from "nfewizard-io";
import type { DistributionCheckpoint, DistributionResult, NfeProvider } from "@apfiscal/shared";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CertificateVaultService } from "../certificate-vault.service";
import { parseDistributionResponse, parseEventResponse } from "./response-parser";
import { ProviderPreparationError } from "../provider-preparation.error";
import { ProviderUnavailableError } from "../provider-unavailable.error";
import { silenceNfeWizardLogger } from "../nfewizard-logger";
import {
  cooldownMessage,
  ExternalRateLimitError,
  isSefazConsumptionLimit,
} from "@/common/sync-feedback";

const UF_CODE: Record<string, number> = {
  RO: 11,
  AC: 12,
  AM: 13,
  RR: 14,
  PA: 15,
  AP: 16,
  TO: 17,
  MA: 21,
  PI: 22,
  CE: 23,
  RN: 24,
  PB: 25,
  PE: 26,
  AL: 27,
  SE: 28,
  BA: 29,
  MG: 31,
  ES: 32,
  RJ: 33,
  SP: 35,
  PR: 41,
  SC: 42,
  RS: 43,
  MS: 50,
  MT: 51,
  GO: 52,
  DF: 53,
};

type WizardContext = { wizard: NFeWizard; cnpj: string; ufCode: number; environment: number };

@Injectable()
export class NfeWizardProvider implements NfeProvider {
  readonly kind = "nfewizard" as const;
  private readonly logger = new Logger(NfeWizardProvider.name);

  constructor(private readonly vault: CertificateVaultService) {
    silenceNfeWizardLogger();
  }

  private async request<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const code =
        error && typeof error === "object" && "code" in error ? String(error.code) : "SEM_CODIGO";
      if (isSefazConsumptionLimit(detail)) {
        const retryAt = new Date(Date.now() + 60 * 60_000);
        this.logger.warn(`Consulta bloqueada pela regra de consumo da SEFAZ atÃ© ${retryAt.toISOString()}.`);
        throw new ExternalRateLimitError(cooldownMessage("A SEFAZ", retryAt), retryAt, "A SEFAZ");
      }
      this.logger.warn(`Falha de transporte com a SEFAZ (${code}): ${detail}`);
      throw new ProviderUnavailableError(
        code === "ECONNRESET"
          ? "A SEFAZ encerrou a conexão antes de responder. Nenhum documento ou checkpoint foi alterado; aguarde alguns minutos para uma nova consulta."
          : code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT"
            ? "A SEFAZ demorou além do limite para responder. Nenhum documento ou checkpoint foi alterado; a sincronização automática tentará novamente."
            : code === "ENOTFOUND" || code === "EAI_AGAIN"
              ? "O endereço do serviço da SEFAZ não pôde ser resolvido. A sincronização será retomada automaticamente quando a comunicação normalizar."
              : "A comunicação com a SEFAZ foi interrompida antes de existir uma resposta fiscal válida. Nenhum documento ou checkpoint foi alterado; tente novamente em alguns minutos.",
        { cause: error },
      );
    }
  }

  private async context(companyId: string): Promise<WizardContext> {
    try {
      const [companyResult, integrationResult] = await Promise.all([
        supabaseAdmin.from("companies").select("cnpj, uf").eq("id", companyId).single(),
        supabaseAdmin
          .from("empresa_integracoes_fiscais")
          .select("certificate_storage_path, certificate_password_encrypted")
          .eq("company_id", companyId)
          .single(),
      ]);
      if (companyResult.error) throw companyResult.error;
      if (integrationResult.error) throw integrationResult.error;
      const certificatePath = String(integrationResult.data.certificate_storage_path ?? "");
      const encryptedPassword = String(integrationResult.data.certificate_password_encrypted ?? "");
      if (!certificatePath || !encryptedPassword)
        throw new Error("Certificado A1 do NFeWizard não configurado para a empresa.");
      const download = await supabaseAdmin.storage.from("fiscal-xml").download(certificatePath);
      if (download.error) throw download.error;
      const certificate = Buffer.from(await download.data.arrayBuffer());
      const uf = String(companyResult.data.uf ?? "").toUpperCase();
      const ufCode = UF_CODE[uf];
      if (!ufCode) throw new Error("UF da empresa inválida para comunicação com a SEFAZ.");
      const environment = Number(process.env.NFE_ENVIRONMENT ?? 1);
      const wizard = new NFeWizard();
      await wizard.NFE_LoadEnvironment({
        config: {
          dfe: {
            baixarXMLDistribuicao: false,
            armazenarXMLConsulta: false,
            armazenarXMLRetorno: false,
            armazenarRetornoEmJSON: false,
            pathCertificado: certificate,
            senhaCertificado: this.vault.decrypt(encryptedPassword),
            UF: uf,
            CPFCNPJ: String(companyResult.data.cnpj).replace(/\D/g, ""),
          },
          nfe: { ambiente: environment, versaoDF: "4.00" },
          lib: {
            connection: { timeout: Number(process.env.NFE_TIMEOUT_MS ?? 30_000) },
            log: { exibirLogNoConsole: false, armazenarLogs: false, pathLogs: ".tmp/nfewizard" },
            useOpenSSL: false,
            useForSchemaValidation: "validateSchemaJsBased",
          },
        },
      });
      return {
        wizard,
        cnpj: String(companyResult.data.cnpj).replace(/\D/g, ""),
        ufCode,
        environment,
      };
    } catch (error) {
      throw new ProviderPreparationError(
        error instanceof Error ? error.message : "Falha ao preparar o NFeWizard.",
        { cause: error },
      );
    }
  }

  async testConnection(companyId: string) {
    const { wizard } = await this.context(companyId);
    const result = await this.request(async () =>
      parseEventResponse(await wizard.NFE_ConsultaStatusServico()),
    );
    return {
      ok: ["107", "128"].includes(result.cStat),
      message: `${result.cStat} — ${result.xMotivo}`,
    };
  }

  async syncDistribution(checkpoint: DistributionCheckpoint): Promise<DistributionResult> {
    const { wizard, cnpj, ufCode } = await this.context(checkpoint.companyId);
    return this.request(async () =>
      parseDistributionResponse(
        await wizard.NFE_DistribuicaoDFePorUltNSU({
          cUFAutor: ufCode,
          CNPJ: cnpj,
          distNSU: { ultNSU: checkpoint.lastNsu.padStart(15, "0") },
        }),
        checkpoint.lastNsu,
      ),
    );
  }

  async getDocumentByNsu(companyId: string, nsu: string): Promise<DistributionResult> {
    const { wizard, cnpj, ufCode } = await this.context(companyId);
    return this.request(async () =>
      parseDistributionResponse(
        await wizard.NFE_DistribuicaoDFePorNSU({
          cUFAutor: ufCode,
          CNPJ: cnpj,
          consNSU: { NSU: nsu.padStart(15, "0") },
        }),
        nsu,
      ),
    );
  }

  async getDocumentByKey(companyId: string, accessKey: string): Promise<DistributionResult> {
    const { wizard, cnpj, ufCode } = await this.context(companyId);
    return this.request(async () =>
      parseDistributionResponse(
        await wizard.NFE_DistribuicaoDFePorChave({
          cUFAutor: ufCode,
          CNPJ: cnpj,
          consChNFe: { chNFe: accessKey },
        }),
        "0",
      ),
    );
  }

  async fetchFullXml(companyId: string, accessKey: string): Promise<string> {
    const response = await this.getDocumentByKey(companyId, accessKey);
    const full = response.documents.find(
      (document) =>
        /procNFe|nfeProc/i.test(document.schema) || /<\s*(?:\w+:)?nfeProc\b/i.test(document.xml),
    );
    if (!full) throw new Error("XML completo ainda não foi liberado pela SEFAZ.");
    return full.xml;
  }

  async manifest(input: Parameters<NfeProvider["manifest"]>[0]) {
    const { wizard, cnpj, ufCode, environment } = await this.context(input.companyId);
    const eventCode = {
      ciencia: "210210",
      confirmacao: "210200",
      desconhecimento: "210220",
      nao_realizada: "210240",
    }[input.event];
    const descriptions = {
      ciencia: "Ciencia da Operacao",
      confirmacao: "Confirmacao da Operacao",
      desconhecimento: "Desconhecimento da Operacao",
      nao_realizada: "Operacao nao Realizada",
    };
    const event = {
      idLote: Date.now() % 1_000_000_000_000_000,
      evento: [
        {
          cOrgao: ufCode,
          tpAmb: environment,
          CNPJ: cnpj,
          chNFe: input.accessKey,
          dhEvento: new Date().toISOString(),
          tpEvento: eventCode,
          nSeqEvento: 1,
          verEvento: "1.00",
          detEvento: {
            descEvento: descriptions[input.event],
            ...(input.justification ? { xJust: input.justification } : {}),
          },
        },
      ],
    };
    return this.request(async () =>
      parseEventResponse(
        await wizard.NFE_RecepcaoEvento(event as Parameters<NFeWizard["NFE_RecepcaoEvento"]>[0]),
      ),
    );
  }
}
