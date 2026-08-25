"use client";

import { supabase } from "@/integrations/supabase/client";
import { backendFetch } from "@/lib/backend";
import {
  baixarXmlDocumento,
  enviarCertificadoFiscal,
  getIntegracaoEmpresa,
  salvarIntegracaoEmpresa,
  testarConexaoApfiscal,
} from "@/lib/client-actions";
import type {
  CertificadoResumo,
  DocumentoFiscal,
  HistoricoIntegracao,
  ManifestacaoNfe,
  ResultadoManifestacaoLote,
  IntegracaoResumo,
  ResultadoCertificadoUpload,
  ResultadoSincronizacao,
  TipoEventoManifestacao,
} from "@/lib/apfiscal/types";

export type {
  CertificadoResumo,
  DocumentoFiscal,
  HistoricoIntegracao,
  ManifestacaoNfe,
  ResultadoManifestacaoLote,
  IntegracaoResumo,
  ResultadoCertificadoUpload,
  ResultadoSincronizacao,
  TipoEventoManifestacao,
};

export async function carregarIntegracao(companyId: string): Promise<IntegracaoResumo> {
  return getIntegracaoEmpresa({ data: { companyId } }) as Promise<IntegracaoResumo>;
}

export async function salvarIntegracao(input: {
  companyId: string;
  apiKey?: string | null;
  ativo: boolean;
  baseUrl?: string | null;
}): Promise<{ ok: boolean }> {
  return salvarIntegracaoEmpresa({ data: input }) as Promise<{ ok: boolean }>;
}

export async function testarConexao(input: {
  companyId: string;
  apiKey?: string | null;
  baseUrl?: string | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  return testarConexaoApfiscal({ data: input }) as Promise<{ ok: boolean; mensagem: string }>;
}

export function enviarCertificado(input: { companyId: string; senha: string; arquivo: File }) {
  const form = new FormData();
  form.append("companyId", input.companyId);
  form.append("senha", input.senha);
  form.append("certificado", input.arquivo, input.arquivo.name);
  return enviarCertificadoFiscal({ data: form }) as Promise<ResultadoCertificadoUpload>;
}

export function sincronizar(companyId: string) {
  return backendFetch<ResultadoSincronizacao>(`/fiscal-integration/sync/${companyId}`, { method: "POST" });
}

export function manifestar(input: {
  companyId: string;
  chave: string;
  tipoEvento: TipoEventoManifestacao;
  justificativa?: string | null;
}) {
  const event = ({ "210210": "ciencia", "210200": "confirmacao", "210220": "desconhecimento", "210240": "nao_realizada" } as const)[input.tipoEvento];
  return backendFetch<{ cStat: string; xMotivo: string }>(`/fiscal-integration/manifest/${input.companyId}`, {
    method: "POST",
    body: JSON.stringify({ accessKey: input.chave, event, justification: input.justificativa ?? undefined }),
  });
}

export function manifestarEmLote(input: {
  companyId: string;
  chaves: string[];
  tipoEvento: TipoEventoManifestacao;
  justificativa?: string | null;
}) {
  const event = ({ "210210": "ciencia", "210200": "confirmacao", "210220": "desconhecimento", "210240": "nao_realizada" } as const)[input.tipoEvento];
  return backendFetch<ResultadoManifestacaoLote>(
    `/fiscal-integration/manifest-batch/${input.companyId}`,
    {
      method: "POST",
      body: JSON.stringify({
        documents: input.chaves.map((accessKey) => ({
          accessKey,
          event,
          justification: input.justificativa ?? undefined,
        })),
      }),
    },
  );
}

export function baixarXml(documentoId: string, tipo: "resumido" | "completo") {
  return baixarXmlDocumento({ data: { documentoId, tipo } });
}

export async function listarDocumentos(companyId: string | null): Promise<DocumentoFiscal[]> {
  let query = supabase
    .from("documentos_fiscais_integracao")
    .select("*")
    .is("xml_completo_path", null)
    .neq("status", "completa")
    .or("tipo_documento.is.null,tipo_documento.neq.Evento")
    .order("nsu", { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as DocumentoFiscal[];
}

export async function listarManifestacoes(companyId: string | null): Promise<ManifestacaoNfe[]> {
  const suffix = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return backendFetch<ManifestacaoNfe[]>(`/fiscal-integration/manifestations${suffix}`);
}

export async function listarHistorico(
  companyId: string | null,
  filtro: "todos" | "sucesso" | "erro" = "todos",
): Promise<HistoricoIntegracao[]> {
  let query = supabase.from("historico_integracao_fiscal").select("*").order("created_at", { ascending: false }).limit(500);
  if (companyId) query = query.eq("company_id", companyId);
  if (filtro !== "todos") query = query.eq("sucesso", filtro === "sucesso");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as HistoricoIntegracao[];
}
