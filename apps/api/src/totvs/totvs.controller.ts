import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { RequirePermission } from "@/common/permission.decorator";
import type { AuthenticatedRequest } from "@/common/request-user";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TotvsQueueService } from "./totvs-queue.service";
import { TotvsSqlServerService } from "./totvs-sql-server.service";

const settingsSchema = z.object({
  enabled: z.boolean(),
  readSyncEnabled: z.boolean(),
  integrationEnabled: z.boolean(),
  timezone: z.string().trim().min(3).max(80).default("America/Sao_Paulo"),
  scheduleHours: z.array(z.number().int().min(0).max(23)).min(1).max(24).transform((values) => [...new Set(values)].sort((a, b) => a - b)),
  safetyWindowDays: z.number().int().min(1).max(30).default(3),
  companyMappings: z.array(z.object({ companyId: z.string().uuid(), coligadaId: z.number().int().positive().nullable() })),
});

@Controller("totvs")
export class TotvsController {
  constructor(
    private readonly queue: TotvsQueueService,
    private readonly sqlServer: TotvsSqlServerService,
  ) {}

  private async organizationId(userId: string): Promise<string> {
    const membership = await supabaseAdmin.from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) throw new NotFoundException("Organização do usuário não encontrada.");
    return membership.data.organization_id;
  }

  @RequirePermission("totvs.integration.view")
  @Get("settings")
  async settings(@Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const [settings, companies, runs, checkpoints, integrationRuns] = await Promise.all([
      supabaseAdmin.from("totvs_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
      supabaseAdmin.from("companies").select("id, razao_social, nome_fantasia, cnpj, totvs_coligada_id").eq("organization_id", organizationId).order("razao_social"),
      supabaseAdmin.from("totvs_sync_runs").select("id, direction, entity, status, trigger, started_at, finished_at, metrics, error_message, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("totvs_sync_checkpoints").select("entity, last_attempt_at, last_success_at, source_watermark, rows_processed, last_error").eq("organization_id", organizationId).order("entity"),
      supabaseAdmin.from("totvs_integration_runs").select("id, fiscal_document_id, status, attempt, rm_record_id, error_message, started_at, finished_at, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50),
    ]);
    for (const result of [settings, companies, runs, checkpoints, integrationRuns]) if (result.error) throw result.error;
    return {
      settings: settings.data ?? {
        enabled: false,
        read_sync_enabled: true,
        integration_enabled: false,
        timezone: "America/Sao_Paulo",
        schedule_hours: [6, 8, 12, 16, 20],
        safety_window_days: 3,
      },
      companies: companies.data ?? [],
      runs: runs.data ?? [],
      checkpoints: checkpoints.data ?? [],
      integrationRuns: integrationRuns.data ?? [],
      environment: {
        sqlConfigured: this.sqlServer.configured(),
        redisConfigured: this.queue.configured(),
        writesEnabled: this.sqlServer.writesEnabled(),
        coligadas: this.sqlServer.configured() ? this.sqlServer.coligadas() : [],
      },
    };
  }

  @RequirePermission("totvs.integration.manage")
  @Patch("settings")
  async saveSettings(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const input = settingsSchema.parse(body);
    if (input.integrationEnabled && !this.sqlServer.writesEnabled()) {
      throw new Error("Defina TOTVS_WRITES_ENABLED=true somente após homologar o SQL de escrita.");
    }
    const companyIds = input.companyMappings.map((mapping) => mapping.companyId);
    if (companyIds.length > 0) {
      const allowed = await supabaseAdmin.from("companies").select("id").eq("organization_id", organizationId).in("id", companyIds);
      if (allowed.error) throw allowed.error;
      if ((allowed.data?.length ?? 0) !== new Set(companyIds).size) throw new Error("Uma empresa informada não pertence à organização.");
    }
    const duplicateColigadas = input.companyMappings.map((mapping) => mapping.coligadaId).filter((value): value is number => value !== null);
    if (new Set(duplicateColigadas).size !== duplicateColigadas.length) throw new Error("Cada coligada TOTVS pode ser associada a somente uma empresa.");
    const saved = await supabaseAdmin.from("totvs_settings").upsert({
      organization_id: organizationId,
      enabled: input.enabled,
      read_sync_enabled: input.readSyncEnabled,
      integration_enabled: input.integrationEnabled,
      timezone: input.timezone,
      schedule_hours: input.scheduleHours,
      safety_window_days: input.safetyWindowDays,
    }, { onConflict: "organization_id" });
    if (saved.error) throw saved.error;
    for (const mapping of input.companyMappings) {
      const update = await supabaseAdmin.from("companies").update({ totvs_coligada_id: mapping.coligadaId }).eq("organization_id", organizationId).eq("id", mapping.companyId);
      if (update.error) throw update.error;
    }
    await this.queue.refreshSchedulers(organizationId);
    return { ok: true };
  }

  @RequirePermission("totvs.integration.manage")
  @Post("test-connection")
  async testConnection(@Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    try {
      const result = await this.sqlServer.testConnection();
      await supabaseAdmin.from("totvs_settings").upsert({
        organization_id: organizationId,
        last_connection_test_at: new Date().toISOString(),
        last_connection_test_ok: true,
        last_connection_error: null,
      }, { onConflict: "organization_id" });
      return result;
    } catch (error) {
      await supabaseAdmin.from("totvs_settings").upsert({
        organization_id: organizationId,
        last_connection_test_at: new Date().toISOString(),
        last_connection_test_ok: false,
        last_connection_error: error instanceof Error ? error.message : "Falha não identificada.",
      }, { onConflict: "organization_id" });
      throw error;
    }
  }

  @RequirePermission("totvs.integration.execute")
  @Post("sync")
  async sync(@Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    return this.queue.enqueueSync({ organizationId, userId: request.user.id, trigger: "manual" });
  }

  @RequirePermission("totvs.integration.execute")
  @Post("integrate/:documentId")
  async integrate(@Param("documentId") documentId: string, @Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const document = await supabaseAdmin.from("fiscal_documents")
      .select("id, company_id, chave_acesso")
      .eq("id", documentId)
      .maybeSingle();
    if (document.error) throw document.error;
    if (!document.data) throw new NotFoundException("NF-e não encontrada.");
    const company = await supabaseAdmin.from("companies").select("organization_id").eq("id", document.data.company_id).single();
    if (company.error || company.data.organization_id !== organizationId) throw new NotFoundException("NF-e não encontrada.");
    return this.queue.enqueueIntegration({
      organizationId,
      companyId: document.data.company_id,
      documentId,
      accessKey: document.data.chave_acesso,
      userId: request.user.id,
    });
  }
}
