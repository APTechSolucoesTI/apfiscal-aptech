// Camada de serviço tipada da integração APFiscal.
// Nenhum componente deve chamar server functions diretamente.
import { supabase } from "@/integrations/supabase/client";
import {
  baixarXmlDocumento,
  getIntegracaoEmpresa,
  manifestarDocumentoFiscal,
  salvarIntegracaoEmpresa,
  sincronizarNfes,
  testarConexaoApfiscal,
} from "@/lib/apfiscal.functions";
import type {
  DocumentoFiscal,
  HistoricoIntegracao,
  IntegracaoResumo,
  ResultadoSincronizacao,
  TipoEventoManifestacao,
} from "@/lib/apfiscal/types";

export type {
  DocumentoFiscal,
  HistoricoIntegracao,
  IntegracaoResumo,
  ResultadoSincronizacao,
  TipoEventoManifestacao,
};

export function carregarIntegracao(companyId: string): Promise<IntegracaoResumo> {
  return getIntegracaoEmpresa({ data: { companyId } });
}

export function salvarIntegracao(input: {
  companyId: string;
  apiKey?: string | null;
  ativo: boolean;
  baseUrl?: string | null;
}): Promise<{ ok: boolean }> {
  return salvarIntegracaoEmpresa({ data: input });
}

export function testarConexao(input: {
  companyId: string;
  apiKey?: string | null;
  baseUrl?: string | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  return testarConexaoApfiscal({ data: input });
}

export function sincronizar(companyId: string): Promise<ResultadoSincronizacao> {
  return sincronizarNfes({ data: { companyId } });
}

export function manifestar(input: {
  companyId: string;
  chave: string;
  tipoEvento: TipoEventoManifestacao;
  justificativa?: string | null;
}) {
  return manifestarDocumentoFiscal({ data: input });
}

export function baixarXml(documentoId: string, tipo: "resumido" | "completo") {
  return baixarXmlDocumento({ data: { documentoId, tipo } });
}

export async function listarDocumentos(companyId: string | null): Promise<DocumentoFiscal[]> {
  let query = supabase
    .from("documentos_fiscais_integracao")
    .select("*")
    .order("nsu", { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as DocumentoFiscal[];
}

export async function listarHistorico(
  companyId: string | null,
  filtro: "todos" | "sucesso" | "erro" = "todos",
): Promise<HistoricoIntegracao[]> {
  let query = supabase
    .from("historico_integracao_fiscal")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (companyId) query = query.eq("company_id", companyId);
  if (filtro !== "todos") query = query.eq("sucesso", filtro === "sucesso");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as HistoricoIntegracao[];
}
