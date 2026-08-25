// Tipos compartilhados da integração APFiscal (seguros para o cliente).

export type StatusDocumentoFiscal =
  | "resumida"
  | "manifestacao_pendente"
  | "aguardando_xml_completo"
  | "completa"
  | "erro";

export type TipoEventoManifestacao = "210200" | "210210" | "210220" | "210240";

export const TIPOS_EVENTO_MANIFESTACAO: { value: TipoEventoManifestacao; label: string }[] = [
  { value: "210210", label: "Ciência da operação (210210)" },
  { value: "210200", label: "Confirmação da operação (210200)" },
  { value: "210220", label: "Desconhecimento da operação (210220)" },
  { value: "210240", label: "Operação não realizada (210240)" },
];

export type DocumentoFiscal = {
  id: string;
  company_id: string;
  nsu: number;
  chave: string;
  tipo_documento: string | null;
  fiscal_document_id: string | null;
  numero: string | null;
  serie: string | null;
  situacao: string | null;
  tipo_evento: string | null;
  schema_documento: string | null;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  emitente_ie: string | null;
  data_emissao: string | null;
  valor_nota: number | null;
  protocolo: string | null;
  status: StatusDocumentoFiscal;
  status_manifestacao: string | null;
  status_download: string | null;
  data_recebimento: string | null;
  ultima_sincronizacao: string | null;
  xml_resumido_path: string | null;
  xml_completo_path: string | null;
  tentativas_xml_completo: number;
  mensagem_sefaz: string | null;
  created_at: string;
  updated_at: string;
};

export type ManifestacaoNfe = {
  id: string;
  company_id: string;
  integration_document_id: string | null;
  fiscal_document_id: string | null;
  access_key: string;
  tipo: "ciencia" | "confirmacao" | "desconhecimento" | "nao_realizada";
  tp_evento: string | null;
  descricao_evento: string | null;
  status: "requested" | "accepted" | "rejected" | "error";
  response_cstat: string | null;
  response_xmotivo: string | null;
  protocolo: string | null;
  event_at: string | null;
  requested_at: string;
};

export type ResultadoManifestacaoLote = {
  total: number;
  processed: number;
  idempotent: number;
  failed: number;
  results: Array<{
    accessKey: string;
    success: boolean;
    accepted?: boolean;
    cStat?: string;
    message: string;
    idempotent?: boolean;
  }>;
};

export type HistoricoIntegracao = {
  id: string;
  company_id: string;
  documento_id: string | null;
  acao: string;
  status_http: number | null;
  sucesso: boolean;
  mensagem: string | null;
  created_at: string;
};

export type ResultadoSincronizacao = {
  documentosDescobertos: number;
  novosDocumentos: number;
  documentosConhecidos: number;
  xmlsResumidosBaixados: number;
  xmlsCompletosBaixados: number;
  eventosManifestacaoProcessados: number;
  notasImportadas: number;
  duplicatas: number;
  aguardandoXmlCompleto: number;
  ultimoNsu: number;
  erros: { chave?: string; nsu?: number; mensagem: string }[];
};

export type ErroApfiscal = {
  codigo: number | null;
  mensagem: string;
  payload?: unknown;
};

export type CertificadoResumo = {
  validadeInicio: string | null;
  validadeFim: string | null;
  diasRestantes: number | null;
  vencido: boolean | null;
  atualizadoEm: string;
};

export type ResultadoCertificadoUpload = {
  ok: boolean;
  mensagem: string;
  ativa: boolean;
  validadeInicio: string | null;
  validadeFim: string | null;
  diasRestantes: number | null;
  vencido: boolean | null;
};

export type IntegracaoResumo = {
  ativo: boolean;
  ultimoNsu: number;
  apiKeyLast4: string | null;
  configurada: boolean;
  baseUrl: string | null;
  certificado: CertificadoResumo | null;
};

export const STATUS_LABEL: Record<StatusDocumentoFiscal, string> = {
  resumida: "Resumida",
  manifestacao_pendente: "Manifestação pendente",
  aguardando_xml_completo: "Aguardando XML completo",
  completa: "Completa",
  erro: "Erro",
};
