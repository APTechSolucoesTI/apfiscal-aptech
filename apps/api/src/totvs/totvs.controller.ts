import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { RequirePermission } from "@/common/permission.decorator";
import type { AuthenticatedRequest } from "@/common/request-user";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TotvsQueueService } from "./totvs-queue.service";
import { TotvsSqlServerService } from "./totvs-sql-server.service";
import { NfseSyncService } from "@/nfse/nfse-sync.service";

const settingsSchema = z.object({
  enabled: z.boolean(),
  readSyncEnabled: z.boolean(),
  integrationEnabled: z.boolean(),
  timezone: z.string().trim().min(3).max(80).default("America/Sao_Paulo"),
  scheduleHours: z.array(z.number().int().min(0).max(23)).min(1).max(24).transform((values) => [...new Set(values)].sort((a, b) => a - b)),
  safetyWindowDays: z.number().int().min(1).max(30).default(3),
  companyMappings: z.array(z.object({ companyId: z.string().uuid(), connectionKey: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/).nullable(), coligadaId: z.number().int().positive().nullable() })),
  nfeSchedules: z.array(z.object({ companyId: z.string().uuid(), enabled: z.boolean(), intervalMinutes: z.number().int().min(15).max(1440) })),
  nfseSchedules: z.array(z.object({ companyId: z.string().uuid(), enabled: z.boolean(), intervalMinutes: z.number().int().min(15).max(1440), provider: z.enum(["nacional_adn", "sigiss", "municipal"]) })).default([]),
});
const connectionKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);

@Controller(["totvs", "synchronizations"])
export class TotvsController {
  constructor(
    private readonly queue: TotvsQueueService,
    private readonly sqlServer: TotvsSqlServerService,
    private readonly nfse: NfseSyncService,
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

  private async scopedConnections(organizationId: string) {
    const companies = await supabaseAdmin.from("companies")
      .select("totvs_connection_key, totvs_coligada_id")
      .eq("organization_id", organizationId);
    if (companies.error) throw companies.error;
    const linkedKeys = new Set((companies.data ?? []).map((company) => company.totvs_connection_key).filter((key): key is string => Boolean(key)));
    const hasLegacyDefault = (companies.data ?? []).some((company) => !company.totvs_connection_key && company.totvs_coligada_id);
    if (hasLegacyDefault || linkedKeys.size === 0) linkedKeys.add(this.sqlServer.defaultKey());
    return this.sqlServer.connections().filter((connection) => linkedKeys.has(connection.key));
  }

  @RequirePermission("totvs.integration.view")
  @Get("settings")
  async settings(@Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const [settings, companies, runs, checkpoints, integrationRuns, nfeSchedules, fiscalRuns, scheduler] = await Promise.all([
      supabaseAdmin.from("totvs_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
      supabaseAdmin.from("companies").select("id, razao_social, nome_fantasia, cnpj, totvs_coligada_id, totvs_connection_key").eq("organization_id", organizationId).order("razao_social"),
      supabaseAdmin.from("totvs_sync_runs").select("id, connection_key, direction, entity, status, trigger, started_at, finished_at, metrics, error_message, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("totvs_sync_checkpoints").select("connection_key, entity, last_attempt_at, last_success_at, source_watermark, rows_processed, last_error").eq("organization_id", organizationId).order("entity"),
      supabaseAdmin.from("totvs_integration_runs").select("id, fiscal_document_id, status, attempt, rm_record_id, error_message, started_at, finished_at, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("empresa_integracoes_fiscais").select("company_id, ativo, automatic_sync_enabled, sync_interval_minutes, primary_provider, nfse_provider, nfse_automatic_sync_enabled, nfse_sync_interval_minutes, nfse_last_sync_at, nfse_last_error").eq("organization_id", organizationId).order("company_id"),
      supabaseAdmin.from("historico_integracao_fiscal").select("id, company_id, acao, sucesso, mensagem, payload_bruto, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
      this.queue.nfeSchedulerStatus(),
    ]);
    for (const result of [settings, companies, runs, checkpoints, integrationRuns, nfeSchedules, fiscalRuns]) if (result.error) throw result.error;
    const scopedConnections = await this.scopedConnections(organizationId);
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
      nfeSchedules: nfeSchedules.data ?? [],
      fiscalRuns: fiscalRuns.data ?? [],
      scheduler,
      environment: {
        sqlConfigured: scopedConnections.some((connection) => connection.configured),
        redisConfigured: this.queue.configured(),
        writesEnabled: scopedConnections.some((connection) => connection.writesEnabled),
        coligadas: scopedConnections.find((connection) => connection.key === this.sqlServer.defaultKey())?.coligadas ?? [],
        defaultConnectionKey: this.sqlServer.defaultKey(),
        connections: scopedConnections,
      },
    };
  }

  @RequirePermission("totvs.integration.manage")
  @Patch("settings")
  async saveSettings(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const input = settingsSchema.parse(body);
    if (input.integrationEnabled && !this.sqlServer.connections().some((connection) => connection.writesEnabled)) {
      throw new BadRequestException("Defina TOTVS_WRITES_ENABLED=true somente após homologar o SQL de escrita.");
    }
    const companyIds = [...new Set([...input.companyMappings.map((mapping) => mapping.companyId), ...input.nfeSchedules.map((schedule) => schedule.companyId), ...input.nfseSchedules.map((schedule) => schedule.companyId)])];
    if (companyIds.length > 0) {
      const allowed = await supabaseAdmin.from("companies").select("id").eq("organization_id", organizationId).in("id", companyIds);
      if (allowed.error) throw allowed.error;
      if ((allowed.data?.length ?? 0) !== companyIds.length) throw new BadRequestException("Uma empresa informada não pertence à organização.");
    }
    const configured = new Map(this.sqlServer.connections().map((connection) => [connection.key, connection]));
    const scopedConnectionKeys = new Set((await this.scopedConnections(organizationId)).map((connection) => connection.key));
    const pairs = input.companyMappings.filter((mapping) => mapping.connectionKey && mapping.coligadaId).map((mapping) => `${mapping.connectionKey}|${mapping.coligadaId}`);
    if (new Set(pairs).size !== pairs.length) throw new BadRequestException("Cada par conexão/coligada pode ser associado a somente uma empresa.");
    for (const mapping of input.companyMappings) {
      if (!mapping.connectionKey || !mapping.coligadaId) continue;
      if (!scopedConnectionKeys.has(mapping.connectionKey)) throw new BadRequestException("A conexão TOTVS deve ser vinculada à organização pelo Super Admin.");
      const connection = configured.get(mapping.connectionKey);
      if (!connection?.configured) throw new BadRequestException(`A conexão ${mapping.connectionKey} não está configurada no ambiente.`);
      if (!connection.coligadas.includes(mapping.coligadaId)) throw new BadRequestException(`A coligada ${mapping.coligadaId} não é permitida em ${mapping.connectionKey}.`);
    }
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
    const mappings = await supabaseAdmin.rpc("apply_totvs_company_mappings", {
      _organization_id: organizationId,
      _mappings: input.companyMappings.map((mapping) => ({ companyId: mapping.companyId, connectionKey: mapping.connectionKey, coligadaId: mapping.coligadaId })),
    });
    if (mappings.error) throw mappings.error;
    for (const schedule of input.nfeSchedules) {
      const update = await supabaseAdmin.from("empresa_integracoes_fiscais").upsert({
        organization_id: organizationId,
        company_id: schedule.companyId,
        automatic_sync_enabled: schedule.enabled,
        sync_interval_minutes: schedule.intervalMinutes,
      }, { onConflict: "company_id" });
      if (update.error) throw update.error;
    }
    for (const schedule of input.nfseSchedules) {
      const update = await supabaseAdmin.from("empresa_integracoes_fiscais").upsert({
        organization_id: organizationId, company_id: schedule.companyId, nfse_provider: schedule.provider,
        nfse_automatic_sync_enabled: schedule.enabled, nfse_sync_interval_minutes: schedule.intervalMinutes,
      }, { onConflict: "company_id" });
      if (update.error) throw update.error;
    }
    await this.queue.refreshSchedulers(organizationId);
    await this.queue.refreshNfeSchedulers(organizationId);
    await this.queue.refreshNfseSchedulers(organizationId);
    return { ok: true };
  }

  @RequirePermission("totvs.integration.manage")
  @Post("test-connection")
  async testConnection(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const { connectionKey } = z.object({ connectionKey: connectionKeySchema.optional() }).parse(body ?? {});
    const key = connectionKey ?? this.sqlServer.defaultKey();
    const scoped = await this.scopedConnections(organizationId);
    if (!scoped.some((connection) => connection.key === key)) throw new BadRequestException("Conexão fora do escopo desta organização.");
    try {
      const result = await this.sqlServer.testConnection(key);
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
  async sync(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const { connectionKey } = z.object({ connectionKey: connectionKeySchema.optional() }).parse(body ?? {});
    const key = connectionKey ?? this.sqlServer.defaultKey();
    const linked = await supabaseAdmin.from("companies").select("id").eq("organization_id", organizationId).or(`totvs_connection_key.eq.${key},and(totvs_connection_key.is.null,totvs_coligada_id.not.is.null)`).limit(1).maybeSingle();
    if (linked.error) throw linked.error;
    if (!linked.data) throw new BadRequestException("Nenhuma empresa está vinculada a esta conexão TOTVS.");
    return this.queue.enqueueSync({ organizationId, connectionKey: key, userId: request.user.id, trigger: "manual" });
  }

  @RequirePermission("nfe.integration.manage")
  @Post("nfe-sync/:companyId")
  async syncNfe(@Param("companyId") companyId: string, @Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const company = await supabaseAdmin.from("companies").select("id").eq("id", companyId).eq("organization_id", organizationId).maybeSingle();
    if (company.error) throw company.error;
    if (!company.data) throw new NotFoundException("Empresa não encontrada.");
    return this.queue.enqueueNfeSync(companyId);
  }

  @RequirePermission("nfe.integration.manage")
  @Post("nfse-test/:companyId")
  async testNfse(@Param("companyId") companyId: string, @Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const company = await supabaseAdmin.from("companies").select("id").eq("id", companyId).eq("organization_id", organizationId).maybeSingle();
    if (company.error) throw company.error;
    if (!company.data) throw new NotFoundException("Empresa não encontrada.");
    return this.nfse.test(companyId);
  }

  @RequirePermission("nfe.integration.manage")
  @Post("nfse-sync/:companyId")
  async syncNfse(@Param("companyId") companyId: string, @Req() request: AuthenticatedRequest) {
    const organizationId = await this.organizationId(request.user.id);
    const company = await supabaseAdmin.from("companies").select("id").eq("id", companyId).eq("organization_id", organizationId).maybeSingle();
    if (company.error) throw company.error;
    if (!company.data) throw new NotFoundException("Empresa não encontrada.");
    return this.queue.enqueueNfseSync(companyId);
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
