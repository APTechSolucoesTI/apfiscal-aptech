// Envio do Certificado Digital A1 (.pfx) para a API fiscal externa e
// persistência da chave definitiva retornada. Server-only.
// A senha do certificado nunca é persistida nem registrada em log.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptApiKey, last4 } from "./crypto.server";

export const MAX_PFX_BYTES = 5 * 1024 * 1024;

export type ResultadoCertificado = {
  ok: boolean;
  mensagem: string;
  ativa: boolean;
  validadeInicio: string | null;
  validadeFim: string | null;
  diasRestantes: number | null;
  vencido: boolean | null;
};

function tokenCadastro(): string {
  const token = process.env.APFISCAL_CADASTRO_TOKEN || process.env.APFISCAL_DEFAULT_API_KEY;
  if (!token) {
    throw new ErroCertificado(500, "Configuração interna incompleta: token de cadastro da API fiscal ausente.");
  }
  return token;
}

function baseUrlCadastro(custom?: string | null): string {
  const url = custom?.trim() || process.env.APFISCAL_BASE_URL;
  if (!url) throw new ErroCertificado(500, "Configuração interna incompleta: URL base da API fiscal ausente.");
  return url.replace(/\/+$/, "");
}

export class ErroCertificado extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroCertificado";
    this.status = status;
  }
}

const MENSAGENS_POR_STATUS: Record<number, string> = {
  400: "CNPJ inválido informado para o cadastro na API fiscal.",
  401: "Falha de configuração interna na autenticação com a API fiscal. Contate o suporte.",
  405: "Método não permitido pela API fiscal neste endpoint.",
  409: "Este CNPJ já está cadastrado na API fiscal. Utilize a opção de substituir certificado.",
  413: "O certificado excede o limite de 5MB.",
  422: "Não foi possível validar o certificado enviado.",
  500: "Erro interno da API fiscal ao processar o certificado.",
  502: "Falha na consulta do CNPJ junto à API fiscal.",
};

// Traduz mensagens conhecidas do retorno 422 (e afins) para português amigável.
function traduzir(status: number, mensagemApi: string | null): string {
  const m = (mensagemApi ?? "").toLowerCase();
  if (!m) return MENSAGENS_POR_STATUS[status] ?? `Erro ${status} ao enviar o certificado.`;
  if (m.includes("senha") && (m.includes("incorret") || m.includes("inválid") || m.includes("invalid")))
    return "Senha do certificado incorreta ou arquivo PFX inválido.";
  if (m.includes("senha") && (m.includes("não informada") || m.includes("obrigat")))
    return "Informe a senha do certificado.";
  if (m.includes("extens")) return "Arquivo inválido: envie um certificado com extensão .pfx.";
  if (m.includes("certificado") && m.includes("não") && m.includes("envi"))
    return "Nenhum certificado foi enviado.";
  if (m.includes("vencid") || m.includes("expirad")) return "O certificado enviado está vencido.";
  if (m.includes("cnpj") && m.includes("diferente"))
    return "O CNPJ do certificado é diferente do CNPJ da empresa cadastrada.";
  if (m.includes("cnpj") && m.includes("sem")) return "O certificado não possui CNPJ identificável.";
  if (m.includes("cidade") || m.includes("estado"))
    return "Cidade ou estado do CNPJ não encontrado na base da API fiscal.";
  if (m.includes("já cadastrad")) return "Este CNPJ já está cadastrado na API fiscal.";
  if (status === 401) return MENSAGENS_POR_STATUS[401];
  return mensagemApi ?? MENSAGENS_POR_STATUS[status] ?? `Erro ${status} ao enviar o certificado.`;
}

function extrairMensagem(payload: unknown, raw: string): string | null {
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    for (const campo of ["mensagem", "message", "erro", "error", "detalhe"]) {
      if (typeof o[campo] === "string" && o[campo]) return String(o[campo]);
    }
  }
  return raw && raw.length < 300 ? raw : null;
}

function apenasDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

export async function enviarCertificado(input: {
  organizationId: string;
  companyId: string;
  cnpj: string;
  senha: string;
  arquivo: File;
}): Promise<ResultadoCertificado> {
  const cnpj = apenasDigitos(input.cnpj);
  if (cnpj.length !== 14) throw new ErroCertificado(400, "CNPJ da empresa inválido.");
  if (!input.senha) throw new ErroCertificado(422, "Informe a senha do certificado.");
  if (!input.arquivo || input.arquivo.size === 0) throw new ErroCertificado(422, "Nenhum certificado foi enviado.");
  if (!/\.pfx$/i.test(input.arquivo.name))
    throw new ErroCertificado(422, "Arquivo inválido: envie um certificado com extensão .pfx.");
  if (input.arquivo.size > MAX_PFX_BYTES) throw new ErroCertificado(413, "O certificado excede o limite de 5MB.");

  const { data: integracao } = await supabaseAdmin
    .from("empresa_integracoes_fiscais")
    .select("base_url")
    .eq("company_id", input.companyId)
    .maybeSingle();

  const form = new FormData();
  form.append("cnpj", cnpj);
  form.append("senha", input.senha);
  form.append("certificado", input.arquivo, input.arquivo.name);

  let res: Response;
  try {
    res = await fetch(`${baseUrlCadastro(integracao?.base_url ?? null)}/postCertificado.php`, {
      method: "POST",
      headers: { "X-API-Key": tokenCadastro(), Accept: "application/json" },
      body: form,
    });
  } catch {
    throw new ErroCertificado(502, "Não foi possível conectar à API fiscal para enviar o certificado.");
  }

  const raw = await res.text().catch(() => "");
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const mensagem = traduzir(res.status, extrairMensagem(payload, raw));
    await registrarHistorico(input, false, res.status, mensagem);
    throw new ErroCertificado(res.status, mensagem);
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const dados = ((body.dados as Record<string, unknown>) ?? body) as Record<string, unknown>;
  const token = String(dados.token_api ?? body.token_api ?? "");
  if (!token) {
    const mensagem = "A API fiscal não retornou a chave de acesso da empresa.";
    await registrarHistorico(input, false, res.status, mensagem);
    throw new ErroCertificado(502, mensagem);
  }

  const cert = ((dados.certificado as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const txt = (v: unknown) => (v == null || v === "" ? null : String(v));
  const ativa = String(dados.api_ativa ?? body.api_ativa ?? "").toUpperCase() === "S";

  const patch = {
    organization_id: input.organizationId,
    company_id: input.companyId,
    ativo: ativa,
    api_key_encrypted: await encryptApiKey(token),
    api_key_last4: last4(token),
    base_url: integracao?.base_url ?? process.env.APFISCAL_BASE_URL ?? null,
    apfiscal_empresa_id: num(dados.empresa_id ?? body.empresa_id),
    apfiscal_system_unit_id: num(dados.system_unit_id ?? body.system_unit_id),
    certificado_validade_inicio: txt(cert.validade_inicio),
    certificado_validade_fim: txt(cert.validade_fim),
    certificado_dias_restantes: num(cert.dias_restantes),
    certificado_vencido: cert.vencido == null ? null : Boolean(cert.vencido),
    certificado_arquivo_path: txt(cert.arquivo),
    certificado_atualizado_em: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("empresa_integracoes_fiscais")
    .upsert(patch as never, { onConflict: "company_id" });
  if (error) throw new ErroCertificado(500, "Certificado aceito, mas houve falha ao salvar a configuração.");

  await registrarHistorico(input, true, res.status, "Certificado digital enviado e integração ativada.");

  return {
    ok: true,
    mensagem: "Certificado enviado e integração configurada com sucesso.",
    ativa,
    validadeInicio: patch.certificado_validade_inicio,
    validadeFim: patch.certificado_validade_fim,
    diasRestantes: patch.certificado_dias_restantes,
    vencido: patch.certificado_vencido,
  };
}

async function registrarHistorico(
  input: { organizationId: string; companyId: string },
  sucesso: boolean,
  status: number,
  mensagem: string,
): Promise<void> {
  await supabaseAdmin.from("historico_integracao_fiscal").insert({
    organization_id: input.organizationId,
    company_id: input.companyId,
    acao: "upload_certificado",
    status_http: status,
    sucesso,
    mensagem,
  } as never);
}
