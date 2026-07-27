// Módulo central de comunicação com a API externa APFiscal.
// NENHUM outro arquivo deve montar URL ou header X-API-Key.
// Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptApiKey } from "./crypto.server";

export class ApfiscalApiError extends Error {
  codigo: number | null;
  payload: unknown;
  constructor(codigo: number | null, mensagem: string, payload?: unknown) {
    super(mensagem);
    this.name = "ApfiscalApiError";
    this.codigo = codigo;
    this.payload = payload;
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "Parâmetros inválidos enviados à API fiscal.",
  401: "Token da API inválido ou não informado.",
  403: "Integração desativada ou acesso negado.",
  404: "Registro ou XML não encontrado.",
  409: "O NSU informado representa um evento, não uma NF-e resumida.",
  422: "Manifestação recusada ou erro retornado pela SEFAZ.",
  500: "Erro interno na API fiscal.",
};

export type IntegracaoEmpresa = {
  id: string;
  organization_id: string;
  company_id: string;
  ativo: boolean;
  ultimo_nsu: number;
  api_key_last4: string | null;
  api_key_encrypted: string | null;
  base_url: string | null;
};

function baseUrl(custom?: string | null): string {
  const url = custom?.trim() || process.env.APFISCAL_BASE_URL;
  if (!url) throw new ApfiscalApiError(null, "URL base da API fiscal não configurada para esta empresa.");
  return url.replace(/\/+$/, "");
}

export async function getIntegracao(companyId: string): Promise<IntegracaoEmpresa> {
  const { data, error } = await supabaseAdmin
    .from("empresa_integracoes_fiscais")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new ApfiscalApiError(null, error.message);
  if (!data) throw new ApfiscalApiError(null, "Integração fiscal não configurada para esta empresa.");
  return data as unknown as IntegracaoEmpresa;
}

async function apiKeyFor(companyId: string, integracao?: IntegracaoEmpresa): Promise<string> {
  const rec = integracao ?? (await getIntegracao(companyId));
  if (!rec.ativo) throw new ApfiscalApiError(403, "Integração fiscal desativada para esta empresa.");
  if (!rec.api_key_encrypted) throw new ApfiscalApiError(401, "Chave de API não cadastrada para esta empresa.");
  return decryptApiKey(rec.api_key_encrypted);
}

async function request(
  companyId: string,
  path: string,
  params: Record<string, string | number>,
  opts: { apiKey?: string; method?: string; baseUrl?: string | null } = {},
): Promise<Response> {
  let rec: IntegracaoEmpresa | undefined;
  if (!opts.apiKey) {
    rec = await getIntegracao(companyId);
  } else if (!opts.baseUrl) {
    rec = (await getIntegracao(companyId).catch(() => undefined)) ?? undefined;
  }
  const key = opts.apiKey ?? (await apiKeyFor(companyId, rec));
  const url = new URL(`${baseUrl(opts.baseUrl ?? rec?.base_url ?? null)}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: { "X-API-Key": key, Accept: "application/json, application/xml;q=0.9" },
  });
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok || res.status === 202) return;
  let payload: unknown = null;
  const raw = await res.text().catch(() => "");
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }
  const msgFromApi =
    payload && typeof payload === "object" && "mensagem" in (payload as Record<string, unknown>)
      ? String((payload as Record<string, unknown>).mensagem)
      : null;
  throw new ApfiscalApiError(
    res.status,
    msgFromApi ?? STATUS_MESSAGES[res.status] ?? `Erro HTTP ${res.status} na API fiscal.`,
    payload,
  );
}

export type NfeResumo = {
  nsu: number;
  chave?: string;
  tipo_documento?: string;
  emitente_cnpj?: string;
  emitente_nome?: string;
  emitente_ie?: string;
  data_emissao?: string;
  valor_nota?: number | string;
  protocolo?: string;
};

export type ListagemNfes = {
  documentos: NfeResumo[];
  proximo_ultimo_nsu: number;
  tem_mais: boolean;
};

export async function listarNfes(
  companyId: string,
  ultimoNsu: number,
  limite = 50,
  apiKey?: string,
  baseUrlOverride?: string | null,
): Promise<ListagemNfes> {
  const limiteFinal = Math.min(Math.max(1, Math.trunc(limite)), 100);
  const res = await request(
    companyId,
    "getNfes.php",
    { ultimo_nsu: ultimoNsu, limite: limiteFinal },
    { apiKey, baseUrl: baseUrlOverride },
  );
  await ensureOk(res);
  const raw = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ApfiscalApiError(res.status, "Resposta inesperada da API fiscal (JSON inválido).", raw);
  }
  if (body.sucesso === false) {
    throw new ApfiscalApiError(res.status, String(body.mensagem ?? "Falha na consulta de NF-e."), body);
  }
  const dados = (body.dados ?? body) as Record<string, unknown>;
  const listaBruta = (dados.documentos ?? dados.nfes ?? dados.itens) as unknown;
  if (!Array.isArray(listaBruta)) {
    throw new ApfiscalApiError(res.status, "Resposta inesperada da API fiscal (lista ausente).", body);
  }
  return {
    documentos: listaBruta as NfeResumo[],
    proximo_ultimo_nsu: Number(dados.proximo_ultimo_nsu ?? body.proximo_ultimo_nsu ?? ultimoNsu),
    tem_mais: Boolean(dados.tem_mais ?? body.tem_mais ?? false),
  };
}

export async function baixarNfeResumida(companyId: string, nsu: number, apiKey?: string): Promise<string> {
  const res = await request(companyId, "getNfeResumida.php", { nsu }, { apiKey });
  await ensureOk(res);
  return res.text();
}

export async function baixarNfeCompleta(companyId: string, chave: string, apiKey?: string): Promise<string> {
  const res = await request(companyId, "getNfeCompleta.php", { chave }, { apiKey });
  if (res.status === 202) throw new ApfiscalApiError(202, "XML completo ainda não disponível.");
  await ensureOk(res);
  return res.text();
}

export type RespostaManifestacao = {
  status: number;
  xml_completo_disponivel: boolean;
  mensagem: string | null;
  protocolo: string | null;
  payload: unknown;
};

export async function manifestarNfe(
  companyId: string,
  chave: string,
  tipoEvento = "210210",
  justificativa: string | null = null,
  apiKey?: string,
): Promise<RespostaManifestacao> {
  const params: Record<string, string> = { chave, tipo_evento: tipoEvento };
  if (justificativa) params.justificativa = justificativa;
  const res = await request(companyId, "manifestarNfe.php", params, { apiKey, method: "POST" });
  await ensureOk(res);
  const raw = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new ApfiscalApiError(res.status, "Resposta inesperada da API fiscal (JSON inválido).", raw);
  }
  const dados = (body.dados ?? body) as Record<string, unknown>;
  return {
    status: res.status,
    xml_completo_disponivel: Boolean(dados.xml_completo_disponivel),
    mensagem: dados.mensagem ? String(dados.mensagem) : body.mensagem ? String(body.mensagem) : null,
    protocolo: dados.protocolo ? String(dados.protocolo) : null,
    payload: body,
  };
}
