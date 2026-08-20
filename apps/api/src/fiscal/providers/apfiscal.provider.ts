import { Injectable } from "@nestjs/common";
import type { DistributionCheckpoint, DistributionResult, NfeProvider } from "@apfiscal/shared";
import { baixarNfeCompleta, baixarNfeResumida, listarNfes, manifestarNfe } from "@/legacy/lib/apfiscal/client.server";

@Injectable()
export class ApfiscalProvider implements NfeProvider {
  readonly kind = "apifiscal" as const;

  async testConnection(companyId: string) {
    await listarNfes(companyId, 0, 1);
    return { ok: true, message: "Conexão com a APFiscal validada." };
  }

  async syncDistribution(checkpoint: DistributionCheckpoint): Promise<DistributionResult> {
    const page = await listarNfes(checkpoint.companyId, Number(checkpoint.lastNsu), 100);
    return {
      cStat: page.documentos.length ? "138" : "137",
      xMotivo: page.documentos.length ? "Documentos localizados." : "Nenhum documento localizado.",
      lastNsu: String(page.proximo_ultimo_nsu),
      documents: await Promise.all(page.documentos.map(async (document) => ({
        nsu: String(document.nsu), schema: "resNFe_v1.01.xsd", xml: await baixarNfeResumida(checkpoint.companyId, document.nsu),
      }))),
    };
  }

  async getDocumentByNsu(companyId: string, nsu: string): Promise<DistributionResult> {
    return { cStat: "138", xMotivo: "Documento localizado.", lastNsu: nsu, documents: [{ nsu, schema: "resNFe_v1.01.xsd", xml: await baixarNfeResumida(companyId, Number(nsu)) }] };
  }

  async getDocumentByKey(companyId: string, accessKey: string): Promise<DistributionResult> {
    return { cStat: "138", xMotivo: "Documento localizado.", lastNsu: "0", documents: [{ nsu: "0", schema: "procNFe_v4.00.xsd", xml: await baixarNfeCompleta(companyId, accessKey) }] };
  }

  fetchFullXml(companyId: string, accessKey: string) {
    return baixarNfeCompleta(companyId, accessKey);
  }

  async manifest(input: Parameters<NfeProvider["manifest"]>[0]) {
    const eventCode = { ciencia: "210210", confirmacao: "210200", desconhecimento: "210220", nao_realizada: "210240" }[input.event];
    const result = await manifestarNfe(input.companyId, input.accessKey, eventCode, input.justification ?? null);
    return { cStat: String(result.status), xMotivo: result.mensagem ?? "Manifestação processada." };
  }
}
