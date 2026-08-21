import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { RequirePermission } from "@/common/permission.decorator";
import type { AuthenticatedRequest } from "@/common/request-user";
import { RbacService } from "@/common/rbac.service";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CertificateVaultService, certificateMatchesCompany } from "./certificate-vault.service";
import { FiscalSyncService } from "./fiscal-sync.service";
import { enviarCertificado } from "@/legacy/lib/apfiscal/certificado.server";

const providerSchema = z.enum(["nfewizard", "apifiscal"]);
const settingsSchema = z.object({
  primaryProvider: providerSchema,
  fallbackProvider: providerSchema.nullable().default("apifiscal"),
  fallbackEnabled: z.boolean().default(false),
  active: z.boolean().default(true),
});
const manifestationSchema = z.object({
  accessKey: z.string().regex(/^\d{44}$/),
  event: z.enum(["ciencia", "confirmacao", "desconhecimento", "nao_realizada"]),
  justification: z.string().trim().min(15).max(255).optional(),
});

@Controller("fiscal-integration")
export class FiscalIntegrationController {
  constructor(
    private readonly syncService: FiscalSyncService,
    private readonly vault: CertificateVaultService,
    private readonly rbac: RbacService,
  ) {}

  private async assertCompany(request: AuthenticatedRequest, companyId: string) {
    await this.rbac.assertCompanyAccess(request.user.id, companyId);
  }

  @RequirePermission("nfe.integration.view")
  @Get("settings/:companyId")
  async settings(@Param("companyId") companyId: string, @Req() request: AuthenticatedRequest) {
    await this.assertCompany(request, companyId);
    const [integration, state] = await Promise.all([
      supabaseAdmin.from("empresa_integracoes_fiscais")
        .select("ativo, primary_provider, fallback_provider, fallback_enabled, certificate_storage_path, certificate_expires_at, api_key_last4, apifiscal_certificate_configured, apifiscal_certificate_last_error")
        .eq("company_id", companyId).single(),
      supabaseAdmin.from("fiscal_distribution_state")
        .select("last_nsu, last_sync_at, next_allowed_sync_at, last_cstat, last_error")
        .eq("company_id", companyId).single(),
    ]);
    if (integration.error) throw integration.error;
    return {
      ...integration.data,
      checkpoint: state.data ?? null,
      certificateConfigured: Boolean(integration.data.certificate_storage_path),
      apifiscalConfigured: Boolean(integration.data.apifiscal_certificate_configured || integration.data.api_key_last4),
    };
  }

  @RequirePermission("nfe.integration.manage")
  @Patch("settings/:companyId")
  async saveSettings(@Param("companyId") companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assertCompany(request, companyId);
    const input = settingsSchema.parse(body);
    const current = await supabaseAdmin.from("empresa_integracoes_fiscais")
      .select("api_key_encrypted")
      .eq("company_id", companyId)
      .single();
    if (current.error) throw current.error;
    const fallbackConfigured = input.fallbackProvider === "apifiscal" && Boolean(current.data.api_key_encrypted);
    const fallbackEnabled = input.primaryProvider === "nfewizard" && input.fallbackEnabled && fallbackConfigured;
    const update = await supabaseAdmin.from("empresa_integracoes_fiscais").update({
      primary_provider: input.primaryProvider,
      fallback_provider: input.fallbackProvider,
      fallback_enabled: fallbackEnabled,
      ativo: input.active,
    }).eq("company_id", companyId);
    if (update.error) throw update.error;
    return {
      ok: true,
      fallbackEnabled,
      warning: input.fallbackEnabled && !fallbackConfigured
        ? "O fallback APFiscal permaneceu desativado porque não possui credenciais."
        : null,
    };
  }

  @RequirePermission("nfe.integration.manage")
  @Post("certificate/:companyId")
  @UseInterceptors(FileInterceptor("certificate", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async uploadCertificate(
    @Param("companyId") companyId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("password") password: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.assertCompany(request, companyId);
    if (!file?.buffer?.length || !/\.(pfx|p12)$/i.test(file.originalname)) throw new BadRequestException("Envie um certificado A1 .pfx ou .p12 válido.");
    const certificate = this.vault.inspectPkcs12(file.buffer, password);
    const company = await supabaseAdmin.from("companies").select("cnpj, organization_id").eq("id", companyId).single();
    if (company.error) throw company.error;
    const integration = await supabaseAdmin.from("empresa_integracoes_fiscais")
      .select("organization_id, ativo, primary_provider, fallback_provider, fallback_enabled")
      .eq("company_id", companyId).single();
    if (integration.error) throw integration.error;
    const companyCnpj = company.data.cnpj?.replace(/\D/g, "") ?? "";
    if (!certificateMatchesCompany(certificate.subjectCnpj, companyCnpj)) {
      throw new BadRequestException("O certificado pertence a outra raiz de CNPJ.");
    }

    const path = `certificates/${companyId}/a1.pfx`;
    const upload = await supabaseAdmin.storage.from("fiscal-xml").upload(path, file.buffer, { contentType: "application/x-pkcs12", upsert: true });
    if (upload.error) throw upload.error;
    try {
      const update = await supabaseAdmin.from("empresa_integracoes_fiscais").update({
        certificate_storage_path: path,
        certificate_password_encrypted: this.vault.encrypt(password),
        certificate_expires_at: certificate.expiresAt.toISOString(),
        certificado_validade_inicio: certificate.validFrom.toISOString(),
        certificado_validade_fim: certificate.expiresAt.toISOString(),
        certificado_dias_restantes: certificate.daysRemaining,
        certificado_vencido: false,
        certificado_atualizado_em: new Date().toISOString(),
      }).eq("company_id", companyId);
      if (update.error) throw update.error;
    } catch (error) {
      await supabaseAdmin.storage.from("fiscal-xml").remove([path]);
      throw error;
    }
    const shouldProvisionApifiscal = integration.data.primary_provider === "apifiscal";
    let apifiscal = { configured: false, message: "Fallback APFiscal não solicitado." };

    if (shouldProvisionApifiscal) {
      const hasApifiscalEnvironment = Boolean(
        process.env.APFISCAL_BASE_URL
        && (process.env.APFISCAL_CADASTRO_TOKEN || process.env.APFISCAL_DEFAULT_API_KEY)
        && process.env.APFISCAL_ENC_KEY,
      );
      if (hasApifiscalEnvironment) {
        try {
          const legacyFile = new File(
            [new Uint8Array(file.buffer)],
            file.originalname.replace(/\.p12$/i, ".pfx"),
            { type: "application/x-pkcs12" },
          );
          const result = await enviarCertificado({
            organizationId: integration.data.organization_id ?? company.data.organization_id,
            companyId,
            cnpj: company.data.cnpj,
            senha: password,
            arquivo: legacyFile,
          });
          apifiscal = { configured: result.ok, message: result.mensagem };
        } catch (error) {
          apifiscal = {
            configured: false,
            message: error instanceof Error ? error.message : "Não foi possível provisionar o fallback APFiscal.",
          };
        }
      } else {
        apifiscal = { configured: false, message: "Credenciais do fallback APFiscal não configuradas na API." };
      }

      await supabaseAdmin.from("empresa_integracoes_fiscais").update({
        ativo: integration.data.ativo,
        apifiscal_certificate_configured: apifiscal.configured,
        apifiscal_certificate_last_error: apifiscal.configured ? null : apifiscal.message,
        apifiscal_certificate_updated_at: new Date().toISOString(),
      }).eq("company_id", companyId);
    }

    return {
      ok: true,
      expiresAt: certificate.expiresAt.toISOString(),
      daysRemaining: certificate.daysRemaining,
      apifiscal,
    };
  }

  @RequirePermission("nfe.integration.manage")
  @Post("test/:companyId")
  async test(@Param("companyId") companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assertCompany(request, companyId);
    const provider = z.object({ provider: providerSchema.optional() }).parse(body).provider;
    return this.syncService.test(companyId, provider);
  }

  @RequirePermission("nfe.integration.manage")
  @Post("sync/:companyId")
  async sync(@Param("companyId") companyId: string, @Req() request: AuthenticatedRequest) {
    await this.assertCompany(request, companyId);
    return this.syncService.sync(companyId);
  }

  @RequirePermission("documents.nfe.manage")
  @Post("manifest/:companyId")
  async manifest(@Param("companyId") companyId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assertCompany(request, companyId);
    const input = manifestationSchema.parse(body);
    const integration = await supabaseAdmin.from("empresa_integracoes_fiscais").select("primary_provider").eq("company_id", companyId).single();
    if (integration.error) throw integration.error;
    const document = await supabaseAdmin.from("fiscal_documents")
      .select("id")
      .eq("company_id", companyId)
      .eq("chave_acesso", input.accessKey)
      .maybeSingle();
    if (document.error) throw document.error;
    if (!document.data) throw new NotFoundException("NF-e não encontrada para esta empresa.");

    const previous = await supabaseAdmin.from("manifestations")
      .select("id, response_cstat, response_xmotivo")
      .eq("fiscal_document_id", document.data.id)
      .eq("tipo", input.event)
      .eq("sequence", 1)
      .maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data?.response_cstat) return { ...previous.data, idempotent: true };

    let pendingId = previous.data?.id;
    if (!pendingId) {
      const pending = await supabaseAdmin.from("manifestations").insert({
        fiscal_document_id: document.data.id,
        tipo: input.event,
        usuario_id: request.user.id,
        provider: integration.data.primary_provider,
        sequence: 1,
        requested_at: new Date().toISOString(),
      }).select("id").single();
      if (pending.error) throw pending.error;
      pendingId = pending.data.id;
    } else {
      const retry = await supabaseAdmin.from("manifestations").update({
        usuario_id: request.user.id,
        provider: integration.data.primary_provider,
        requested_at: new Date().toISOString(),
        response_xmotivo: null,
      }).eq("id", pendingId);
      if (retry.error) throw retry.error;
    }

    try {
      const result = await this.syncService.provider(integration.data.primary_provider).manifest({
        companyId,
        accessKey: input.accessKey,
        event: input.event,
        justification: input.justification,
      });
      const update = await supabaseAdmin.from("manifestations").update({
        response_cstat: result.cStat,
        response_xmotivo: result.xMotivo,
      }).eq("id", pendingId);
      if (update.error) throw update.error;
      return { ...result, idempotent: false };
    } catch (error) {
      await supabaseAdmin.from("manifestations").update({
        response_xmotivo: error instanceof Error ? error.message : "Falha não identificada no envio do evento.",
      }).eq("id", pendingId);
      throw error;
    }
  }
}
