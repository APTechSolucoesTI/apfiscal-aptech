export type NfeProviderKind = "nfewizard" | "apifiscal";

export type DistributionCheckpoint = {
  companyId: string;
  cnpj: string;
  lastNsu: string;
  nextAllowedSyncAt: string | null;
};

export type DistributionResult = {
  cStat: string;
  xMotivo: string;
  lastNsu: string;
  maxNsu?: string;
  documents: Array<{ nsu: string; schema: string; xml: string }>;
};

export type ManifestationResult = {
  cStat: string;
  xMotivo: string;
  protocol?: string;
  eventAt?: string;
  rawResponse?: unknown;
};

export interface NfeProvider {
  readonly kind: NfeProviderKind;
  testConnection(companyId: string): Promise<{ ok: boolean; message: string }>;
  syncDistribution(checkpoint: DistributionCheckpoint): Promise<DistributionResult>;
  getDocumentByNsu(companyId: string, nsu: string): Promise<DistributionResult>;
  getDocumentByKey(companyId: string, accessKey: string): Promise<DistributionResult>;
  fetchFullXml(companyId: string, accessKey: string): Promise<string>;
  manifest(input: {
    companyId: string;
    accessKey: string;
    event: "ciencia" | "confirmacao" | "desconhecimento" | "nao_realizada";
    justification?: string;
  }): Promise<ManifestationResult>;
}
