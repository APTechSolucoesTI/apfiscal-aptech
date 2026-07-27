// Lógica de sincronização/manifestação da integração APFiscal. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ApfiscalApiError,
  baixarNfeCompleta,
  baixarNfeResumida,
  getIntegracao,
  listarNfes,
  manifestarNfe,
  type IntegracaoEmpresa,
  type NfeResumo,
} from "./client.server";
import type { ResultadoSincronizacao, StatusDocumentoFiscal } from "./types";

const BUCKET = "fiscal-xml";
export const MAX_TENTATIVAS_XML = 6;

export function mensagemErro(e: unknown): string {
  if (e instanceof ApfiscalApiError) return e.message;
  return e instanceof Error ? e.message : "Erro desconhecido.";
}

export async function registrarHistorico(input: {
  organizationId: string;
  companyId: string;
  documentoId?: string | null;
  acao: string;
  statusHttp?: number | null;
  sucesso: boolean;
  mensagem?: string | null;
  payload?: unknown;
}) {
  await supabaseAdmin.from("historico_integracao_fiscal").insert({
    organization_id: input.organizationId,
    company_id: input.companyId,
    documento_id: input.documentoId ?? null,
    acao: input.acao,
    status_http: input.statusHttp ?? null,
    sucesso: input.sucesso,
    mensagem: input.mensagem ?? null,
    payload_bruto: (input.payload ?? null) as never,
  } as never);
}

async function salvarXml(companyId: string, nome: string, conteudo: string): Promise<string> {
  const path = `${companyId}/${nome}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, new Blob([conteudo], { type: "application/xml" }), {
      contentType: "application/xml",
      upsert: true,
    });
  if (error) throw new Error(error.message);
  return path;
}

export async function lerXml(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "XML não encontrado.");
  return data.text();
}

function normalizarDocumento(doc: NfeResumo, integ: IntegracaoEmpresa) {
  const valor = doc.valor_nota != null ? Number(doc.valor_nota) : null;
  return {
    organization_id: integ.organization_id,
    company_id: integ.company_id,
    nsu: Number(doc.nsu),
    chave: String(doc.chave ?? ""),
    tipo_documento: doc.tipo_documento ?? null,
    emitente_cnpj: doc.emitente_cnpj ?? null,
    emitente_nome: doc.emitente_nome ?? null,
    emitente_ie: doc.emitente_ie ?? null,
    data_emissao: doc.data_emissao ?? null,
    valor_nota: Number.isFinite(valor as number) ? valor : null,
    protocolo: doc.protocolo ?? null,
  };
}

export async function sincronizarEmpresa(companyId: string): Promise<ResultadoSincronizacao> {
  const integ = await getIntegracao(companyId);
  try {
    return await executarSincronizacao(companyId, integ);
  } catch (e) {
    await registrarHistorico({
      organizationId: integ.organization_id,
      companyId,
      acao: "sincronizar",
      statusHttp: e instanceof ApfiscalApiError ? e.codigo : null,
      sucesso: false,
      mensagem: mensagemErro(e),
      payload: e instanceof ApfiscalApiError ? e.payload : null,
    });
    throw e;
  }
}

async function executarSincronizacao(
  companyId: string,
  integ: IntegracaoEmpresa,
): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = {
    novosDocumentos: 0,
    xmlsResumidosBaixados: 0,
    xmlsCompletosBaixados: 0,
    notasImportadas: 0,
    ultimoNsu: integ.ultimo_nsu,
    erros: [],
  };

  let ultimoNsu = integ.ultimo_nsu;
  let temMais = true;
  let paginas = 0;

  while (temMais && paginas < 50) {
    paginas++;
    const pagina = await listarNfes(companyId, ultimoNsu, 100);
    const validos = pagina.documentos.filter((d) => d.chave && d.nsu != null);

    const novos: { id: string; nsu: number; chave: string; tipo: string | null }[] = [];
    for (const doc of validos) {
      const registro = normalizarDocumento(doc, integ);
      const { data, error } = await supabaseAdmin
        .from("documentos_fiscais_integracao")
        .upsert(registro as never, { onConflict: "company_id,chave" })
        .select("id, nsu, chave, tipo_documento, xml_resumido_path")
        .single();
      if (error) {
        resultado.erros.push({ chave: registro.chave, nsu: registro.nsu, mensagem: error.message });
        continue;
      }
      resultado.novosDocumentos++;
      if (!data.xml_resumido_path) {
        novos.push({ id: data.id, nsu: data.nsu, chave: data.chave, tipo: data.tipo_documento });
      }
    }

    // Só avança o checkpoint depois de persistir a página.
    if (resultado.erros.length === 0 || validos.length > 0) {
      ultimoNsu = pagina.proximo_ultimo_nsu || ultimoNsu;
      await supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .update({ ultimo_nsu: ultimoNsu } as never)
        .eq("company_id", companyId);
      resultado.ultimoNsu = ultimoNsu;
    }

    for (const doc of novos) {
      const tipo = (doc.tipo ?? "").toLowerCase();
      try {
        if (tipo.includes("completa")) {
          // Ciência já dada: o XML completo está disponível — baixa e importa como NF-e.
          await baixarESalvarXmlCompleto(companyId, doc.chave, doc.id, integ.organization_id);
          resultado.xmlsCompletosBaixados++;
          const importado = await importarXmlCompleto(companyId, doc.chave, doc.id, integ.organization_id);
          if (importado) resultado.notasImportadas++;
        } else if (tipo === "nfe_resumida" || tipo.includes("resumida")) {
          const xml = await baixarNfeResumida(companyId, doc.nsu);
          const path = await salvarXml(companyId, `resumida-${doc.chave}.xml`, xml);
          await supabaseAdmin
            .from("documentos_fiscais_integracao")
            .update({ xml_resumido_path: path, status: "resumida" } as never)
            .eq("id", doc.id);
          resultado.xmlsResumidosBaixados++;
        }
      } catch (e) {
        resultado.erros.push({ chave: doc.chave, nsu: doc.nsu, mensagem: mensagemErro(e) });
      }
    }

    temMais = pagina.tem_mais && validos.length > 0;
  }

  await registrarHistorico({
    organizationId: integ.organization_id,
    companyId,
    acao: "sincronizar",
    statusHttp: 200,
    sucesso: resultado.erros.length === 0,
    mensagem: `${resultado.novosDocumentos} documentos, ${resultado.xmlsResumidosBaixados} XMLs resumidos, ${resultado.xmlsCompletosBaixados} XMLs completos, ${resultado.notasImportadas} NF-e importadas, ${resultado.erros.length} erros.`,
  });

  return resultado;
}

async function marcarStatus(id: string, patch: Record<string, unknown>) {
  await supabaseAdmin.from("documentos_fiscais_integracao").update(patch as never).eq("id", id);
}

export async function manifestarDocumento(input: {
  companyId: string;
  chave: string;
  tipoEvento: string;
  justificativa: string | null;
}) {
  const integ = await getIntegracao(input.companyId);
  const { data: doc } = await supabaseAdmin
    .from("documentos_fiscais_integracao")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("chave", input.chave)
    .maybeSingle();
  const docId = doc?.id ?? null;

  try {
    const resp = await manifestarNfe(input.companyId, input.chave, input.tipoEvento, input.justificativa);

    if (resp.status === 202 || (!resp.xml_completo_disponivel && resp.status !== 200)) {
      if (docId) {
        await marcarStatus(docId, {
          status: "aguardando_xml_completo" satisfies StatusDocumentoFiscal,
          protocolo: resp.protocolo,
          mensagem_sefaz: resp.mensagem,
          tentativas_xml_completo: 0,
        });
      }
      await registrarHistorico({
        organizationId: integ.organization_id,
        companyId: input.companyId,
        documentoId: docId,
        acao: "manifestar",
        statusHttp: resp.status,
        sucesso: true,
        mensagem: resp.mensagem ?? "Manifestação aceita; aguardando XML completo.",
        payload: resp.payload,
      });
      return { status: "aguardando_xml_completo" as StatusDocumentoFiscal, mensagem: resp.mensagem };
    }

    if (resp.xml_completo_disponivel && docId) {
      await baixarESalvarXmlCompleto(input.companyId, input.chave, docId, integ.organization_id);
      await importarXmlCompleto(input.companyId, input.chave, docId, integ.organization_id);
    } else if (docId) {
      await marcarStatus(docId, {
        status: "aguardando_xml_completo" satisfies StatusDocumentoFiscal,
        protocolo: resp.protocolo,
        mensagem_sefaz: resp.mensagem,
      });
    }

    await registrarHistorico({
      organizationId: integ.organization_id,
      companyId: input.companyId,
      documentoId: docId,
      acao: "manifestar",
      statusHttp: resp.status,
      sucesso: true,
      mensagem: resp.mensagem ?? "Manifestação registrada.",
      payload: resp.payload,
    });

    return { status: "completa" as StatusDocumentoFiscal, mensagem: resp.mensagem };
  } catch (e) {
    const codigo = e instanceof ApfiscalApiError ? e.codigo : null;
    const mensagem = mensagemErro(e);
    if (docId) {
      await marcarStatus(docId, { status: "erro" satisfies StatusDocumentoFiscal, mensagem_sefaz: mensagem });
    }
    await registrarHistorico({
      organizationId: integ.organization_id,
      companyId: input.companyId,
      documentoId: docId,
      acao: "manifestar",
      statusHttp: codigo,
      sucesso: false,
      mensagem,
      payload: e instanceof ApfiscalApiError ? e.payload : null,
    });
    throw e;
  }
}

/**
 * Importa o XML completo já salvo no storage para os cadastros de NF-e
 * (mesmo fluxo do "Importar XML" manual). Retorna true quando a nota foi criada.
 */
export async function importarXmlCompleto(
  companyId: string,
  chave: string,
  docId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: reg } = await supabaseAdmin
    .from("documentos_fiscais_integracao")
    .select("xml_completo_path")
    .eq("id", docId)
    .maybeSingle();
  const path = reg?.xml_completo_path;
  if (!path) return false;

  const xml = await lerXml(path);
  const { importarNfeXml } = await import("@/lib/nfe-import.server");
  try {
    const res = await importarNfeXml(supabaseAdmin as never, { fileName: `completa-${chave}.xml`, xml });
    await registrarHistorico({
      organizationId,
      companyId,
      documentoId: docId,
      acao: "importar_nfe",
      statusHttp: 200,
      sucesso: true,
      mensagem: res.duplicated ? "NF-e já importada anteriormente." : "NF-e importada a partir do XML completo.",
    });
    return Boolean(res.ok);
  } catch (e) {
    await registrarHistorico({
      organizationId,
      companyId,
      documentoId: docId,
      acao: "importar_nfe",
      sucesso: false,
      mensagem: mensagemErro(e),
    });
    return false;
  }
}

export async function baixarESalvarXmlCompleto(
  companyId: string,
  chave: string,
  docId: string,
  organizationId: string,
) {
  const xml = await baixarNfeCompleta(companyId, chave);
  const path = await salvarXml(companyId, `completa-${chave}.xml`, xml);
  await marcarStatus(docId, {
    xml_completo_path: path,
    status: "completa" satisfies StatusDocumentoFiscal,
    mensagem_sefaz: null,
  });
  await registrarHistorico({
    organizationId,
    companyId,
    documentoId: docId,
    acao: "baixar_xml_completo",
    statusHttp: 200,
    sucesso: true,
    mensagem: "XML completo baixado.",
  });
  return path;
}

export async function processarFilaXmlCompleto(limite = 50) {
  const { data: pendentes } = await supabaseAdmin
    .from("documentos_fiscais_integracao")
    .select("id, company_id, organization_id, chave, tentativas_xml_completo")
    .eq("status", "aguardando_xml_completo")
    .lt("tentativas_xml_completo", MAX_TENTATIVAS_XML)
    .limit(limite);

  let concluidos = 0;
  let falhas = 0;

  for (const doc of pendentes ?? []) {
    const tentativas = (doc.tentativas_xml_completo ?? 0) + 1;
    try {
      await baixarESalvarXmlCompleto(doc.company_id, doc.chave, doc.id, doc.organization_id);
      concluidos++;
    } catch (e) {
      falhas++;
      const esgotou = tentativas >= MAX_TENTATIVAS_XML;
      await marcarStatus(doc.id, {
        tentativas_xml_completo: tentativas,
        ...(esgotou
          ? {
              status: "erro" satisfies StatusDocumentoFiscal,
              mensagem_sefaz: "XML completo não disponibilizado pela SEFAZ após 6 tentativas",
            }
          : {}),
      });
      await registrarHistorico({
        organizationId: doc.organization_id,
        companyId: doc.company_id,
        documentoId: doc.id,
        acao: "baixar_xml_completo",
        statusHttp: e instanceof ApfiscalApiError ? e.codigo : null,
        sucesso: false,
        mensagem: esgotou
          ? "XML completo não disponibilizado pela SEFAZ após 6 tentativas"
          : `Tentativa ${tentativas}: ${mensagemErro(e)}`,
      });
    }
  }

  return { processados: pendentes?.length ?? 0, concluidos, falhas };
}
