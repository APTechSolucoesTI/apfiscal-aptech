import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertCompanyAccess } from "./apfiscal/auth.server";
import type {
  IntegracaoResumo,
  ResultadoCertificadoUpload,
  ResultadoSincronizacao,
} from "./apfiscal/types";

export const getIntegracaoEmpresa = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string }) => {
    if (!data?.companyId) throw new Error("Empresa é obrigatória.");
    return data;
  })
  .handler(async ({ data, context }): Promise<IntegracaoResumo> => {
    const { organizationId } = await assertCompanyAccess(context.supabase, data.companyId);
    let { data: rec } = await supabaseAdmin
      .from("empresa_integracoes_fiscais")
      .select(
        "ativo, ultimo_nsu, api_key_last4, api_key_encrypted, base_url, certificado_validade_inicio, certificado_validade_fim, certificado_dias_restantes, certificado_vencido, certificado_atualizado_em",
      )
      .eq("company_id", data.companyId)
      .maybeSingle();

    // Provisiona automaticamente a integração da nova empresa com os valores padrão do servidor.
    if (!rec && process.env.APFISCAL_DEFAULT_API_KEY) {
      const { encryptApiKey, last4 } = await import("./apfiscal/crypto.server");
      const key = process.env.APFISCAL_DEFAULT_API_KEY;
      const { data: criado } = await supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .upsert(
          {
            organization_id: organizationId,
            company_id: data.companyId,
            ativo: false,
            base_url: process.env.APFISCAL_BASE_URL || null,
            api_key_encrypted: await encryptApiKey(key),
            api_key_last4: last4(key),
          } as never,
          { onConflict: "company_id" },
        )
        .select(
          "ativo, ultimo_nsu, api_key_last4, api_key_encrypted, base_url, certificado_validade_inicio, certificado_validade_fim, certificado_dias_restantes, certificado_vencido, certificado_atualizado_em",
        )
        .maybeSingle();
      rec = criado ?? null;
    }

    return {
      ativo: rec?.ativo ?? false,
      ultimoNsu: Number(rec?.ultimo_nsu ?? 0),
      apiKeyLast4: rec?.api_key_last4 ?? null,
      configurada: Boolean(rec?.api_key_encrypted),
      baseUrl: rec?.base_url ?? null,
      certificado: rec?.certificado_atualizado_em
        ? {
            validadeInicio: rec.certificado_validade_inicio ?? null,
            validadeFim: rec.certificado_validade_fim ?? null,
            diasRestantes: rec.certificado_dias_restantes ?? null,
            vencido: rec.certificado_vencido ?? null,
            atualizadoEm: rec.certificado_atualizado_em,
          }
        : null,
    };
  });

export const enviarCertificadoFiscal = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error("Envio inválido do certificado.");
    return data;
  })
  .handler(async ({ data, context }): Promise<ResultadoCertificadoUpload> => {
    const companyId = String(data.get("companyId") ?? "");
    const senha = String(data.get("senha") ?? "");
    const arquivo = data.get("certificado");
    if (!companyId) throw new Error("Empresa é obrigatória.");
    if (!(arquivo instanceof File)) throw new Error("Nenhum certificado foi enviado.");

    const { organizationId } = await assertCompanyAccess(context.supabase, companyId);
    const { data: empresa, error } = await context.supabase
      .from("companies")
      .select("cnpj")
      .eq("id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!empresa?.cnpj)
      throw new Error("Cadastre o CNPJ da empresa antes de enviar o certificado.");

    const { enviarCertificado } = await import("./apfiscal/certificado.server");
    return enviarCertificado({ organizationId, companyId, cnpj: empresa.cnpj, senha, arquivo });
  });

export const salvarIntegracaoEmpresa = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      companyId: string;
      apiKey?: string | null;
      ativo: boolean;
      baseUrl?: string | null;
    }) => {
      if (!data?.companyId) throw new Error("Empresa é obrigatória.");
      if (data.apiKey != null && data.apiKey.trim().length > 0 && data.apiKey.trim().length < 8) {
        throw new Error("Chave de API inválida.");
      }
      const url = data.baseUrl?.trim();
      if (url) {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error("URL base inválida.");
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("URL base deve usar http ou https.");
        }
        if (url.length > 300) throw new Error("URL base muito longa.");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { organizationId } = await assertCompanyAccess(context.supabase, data.companyId);
    const { encryptApiKey, last4 } = await import("./apfiscal/crypto.server");

    const { data: atual } = await supabaseAdmin
      .from("empresa_integracoes_fiscais")
      .select("api_key_encrypted")
      .eq("company_id", data.companyId)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      organization_id: organizationId,
      company_id: data.companyId,
      ativo: data.ativo,
      base_url: data.baseUrl?.trim() || process.env.APFISCAL_BASE_URL || null,
    };
    // Chave informada > chave já cadastrada > chave padrão do servidor (nova empresa).
    const key =
      data.apiKey?.trim() ||
      (atual?.api_key_encrypted ? null : process.env.APFISCAL_DEFAULT_API_KEY);
    if (key) {
      patch.api_key_encrypted = await encryptApiKey(key);
      patch.api_key_last4 = last4(key);
    }
    const { error } = await supabaseAdmin
      .from("empresa_integracoes_fiscais")
      .upsert(patch as never, { onConflict: "company_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testarConexaoApfiscal = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { companyId: string; apiKey?: string | null; baseUrl?: string | null }) => {
      if (!data?.companyId) throw new Error("Empresa é obrigatória.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, data.companyId);
    const { listarNfes } = await import("./apfiscal/client.server");
    const { mensagemErro } = await import("./apfiscal/sync.server");
    try {
      await listarNfes(
        data.companyId,
        0,
        1,
        data.apiKey?.trim() || undefined,
        data.baseUrl?.trim() || undefined,
      );
      return { ok: true, mensagem: "Conexão estabelecida com sucesso." };
    } catch (e) {
      return { ok: false, mensagem: mensagemErro(e) };
    }
  });

export const sincronizarNfes = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string }) => {
    if (!data?.companyId) throw new Error("Empresa é obrigatória.");
    return data;
  })
  .handler(async ({ data, context }): Promise<ResultadoSincronizacao> => {
    await assertCompanyAccess(context.supabase, data.companyId);
    const { sincronizarEmpresa } = await import("./apfiscal/sync.server");
    return sincronizarEmpresa(data.companyId);
  });

export const manifestarDocumentoFiscal = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      companyId: string;
      chave: string;
      tipoEvento: string;
      justificativa?: string | null;
    }) => {
      if (!data?.companyId) throw new Error("Empresa é obrigatória.");
      if (!/^\d{44}$/.test(data.chave ?? "")) throw new Error("Chave de acesso inválida.");
      if (!/^\d{6}$/.test(data.tipoEvento ?? "")) throw new Error("Tipo de evento inválido.");
      if (data.tipoEvento === "210240" && (data.justificativa ?? "").trim().length < 15) {
        throw new Error("Justificativa obrigatória com no mínimo 15 caracteres.");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.supabase, data.companyId);
    const { manifestarDocumento } = await import("./apfiscal/sync.server");
    return manifestarDocumento({
      companyId: data.companyId,
      chave: data.chave,
      tipoEvento: data.tipoEvento,
      justificativa: data.justificativa?.trim() || null,
    });
  });

export const baixarXmlDocumento = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentoId: string; tipo: "resumido" | "completo" }) => {
    if (!data?.documentoId) throw new Error("Documento é obrigatório.");
    if (data.tipo !== "resumido" && data.tipo !== "completo") throw new Error("Tipo inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("documentos_fiscais_integracao")
      .select("chave, xml_resumido_path, xml_completo_path")
      .eq("id", data.documentoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Documento não encontrado.");
    const path = data.tipo === "resumido" ? doc.xml_resumido_path : doc.xml_completo_path;
    if (!path) throw new Error("XML indisponível para este documento.");
    const { lerXml } = await import("./apfiscal/sync.server");
    return { chave: doc.chave, xml: await lerXml(path) };
  });
