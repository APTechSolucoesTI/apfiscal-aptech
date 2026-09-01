"use client";

import { backendFetch } from "@/lib/backend";

export type TotvsRunSummary = {
  id?: string;
  fiscal_document_id?: string;
  status: string;
  attempt: number;
  rm_record_id: string | null;
  error_message: string | null;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
};

export type NfseListItem = {
  id: string;
  company_id: string;
  numero: string;
  serie: string | null;
  chave_acesso: string;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  destinatario_cnpj: string | null;
  destinatario_nome: string | null;
  valor_total: number | null;
  valor_impostos: number | null;
  situacao: string | null;
  status: string;
  data_emissao: string | null;
  competence_date: string | null;
  service_municipality_name: string | null;
  service_gross_value: number | null;
  service_net_value: number | null;
  retentions_value: number | null;
  iss_value: number | null;
  sync_status: string;
  xml_path: string | null;
  xml_available: boolean;
  source_provider: string | null;
  last_sync_success_at: string | null;
  processing_error: string | null;
  companies: { razao_social: string | null; nome_fantasia: string | null; cnpj: string } | null;
  totvs: TotvsRunSummary | null;
};

export type NfseDetail = {
  document: NfseListItem & {
    plano_contas_id: string | null;
    local_estoque_id: string | null;
    tipo_compra_id: string | null;
    tipo_movimento_id: string | null;
    verification_code: string | null;
    external_id: string | null;
    service_municipality_code: string | null;
    incidence_municipality_code: string | null;
    incidence_municipality_name: string | null;
    deductions_value: number | null;
    unconditional_discount_value: number | null;
    conditional_discount_value: number | null;
    iss_base_value: number | null;
    iss_rate: number | null;
    service_code_national: string | null;
    service_code_municipal: string | null;
    cnae_code: string | null;
    service_description: string | null;
    natureza_operacao: string | null;
    tax_regime: string | null;
    special_tax_regime: string | null;
    nfse_details: {
      issuer?: Record<string, unknown>;
      recipient?: Record<string, unknown>;
      service?: Record<string, unknown>;
      taxes?: Record<string, unknown>;
      source?: Record<string, unknown>;
    };
    xml_content: string | null;
    created_at: string;
    updated_at: string;
  };
  history: Array<{
    id: string;
    event_type: string;
    status: string | null;
    message: string | null;
    payload: Record<string, unknown> | null;
    occurred_at: string;
  }>;
  runs: TotvsRunSummary[];
  distribution: {
    provider: string;
    nsu: number;
    content_type: string | null;
    received_at: string;
  } | null;
};

export const listNfse = () => backendFetch<NfseListItem[]>("/fiscal-documents/nfse");
export const getNfse = (id: string) => backendFetch<NfseDetail>(`/fiscal-documents/nfse/${id}`);
export const getFiscalXml = (id: string) =>
  backendFetch<{ filename: string; xml: string }>(`/fiscal-documents/${id}/xml`);

export function importNfseXml(file: File) {
  const body = new FormData();
  body.append("xml", file, file.name);
  return backendFetch<{ id: string; duplicated: boolean; companyName: string }>(
    "/fiscal-documents/nfse/import",
    { method: "POST", body },
  );
}
