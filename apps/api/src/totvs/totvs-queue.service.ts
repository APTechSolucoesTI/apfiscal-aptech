import {
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { FiscalSyncService } from "@/fiscal/fiscal-sync.service";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TotvsIntegrationService } from "./totvs-integration.service";
import { TotvsSyncService } from "./totvs-sync.service";
import { TotvsSqlServerService } from "./totvs-sql-server.service";
import { TotvsScopeService } from "./totvs-scope.service";
import { NfseSyncService } from "@/nfse/nfse-sync.service";
import { cooldownException } from "@/common/sync-feedback";

type SyncJob = { runId?: string; organizationId?: string; connectionKey?: string };
type IntegrationJob = { runId: string };
type NfeSyncJob = { companyId: string };
type NfseSyncJob = { companyId: string };

function redisConnection(): ConnectionOptions | null {
  const raw = process.env.REDIS_URL?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class TotvsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TotvsQueueService.name);
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private syncQueue: Queue<SyncJob> | null = null;
  private integrationQueue: Queue<IntegrationJob> | null = null;
  private nfeSyncQueue: Queue<NfeSyncJob> | null = null;
  private nfseSyncQueue: Queue<NfseSyncJob> | null = null;
  private syncWorker: Worker<SyncJob> | null = null;
  private integrationWorker: Worker<IntegrationJob> | null = null;
  private nfeSyncWorker: Worker<NfeSyncJob> | null = null;
  private nfseSyncWorker: Worker<NfseSyncJob> | null = null;

  constructor(
    private readonly syncService: TotvsSyncService,
    private readonly integrationService: TotvsIntegrationService,
    private readonly fiscalSyncService: FiscalSyncService,
    private readonly sqlServer: TotvsSqlServerService,
    private readonly scopes: TotvsScopeService,
    private readonly nfseSyncService: NfseSyncService,
  ) {}

  configured(): boolean {
    return Boolean(redisConnection());
  }

  async onModuleInit() {
    const connection = redisConnection();
    if (!connection) return;
    this.syncQueue = new Queue<SyncJob>("totvs-sync", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
    this.integrationQueue = new Queue<IntegrationJob>("totvs-integration", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
    this.nfeSyncQueue = new Queue<NfeSyncJob>("nfe-sync", {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
    this.nfseSyncQueue = new Queue<NfseSyncJob>("nfse-sync", {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
    this.syncWorker = new Worker<SyncJob>("totvs-sync", (job) => this.processSync(job), {
      connection,
      concurrency: 1,
    });
    this.integrationWorker = new Worker<IntegrationJob>(
      "totvs-integration",
      (job) => this.processIntegration(job),
      { connection, concurrency: 1 },
    );
    this.nfeSyncWorker = new Worker<NfeSyncJob>("nfe-sync", (job) => this.processNfeSync(job), {
      connection,
      concurrency: 1,
    });
    this.nfseSyncWorker = new Worker<NfseSyncJob>("nfse-sync", (job) => this.processNfseSync(job), {
      connection,
      concurrency: 1,
    });
    this.syncWorker.on("error", (error) => this.logger.error(`Worker TOTVS: ${error.message}`));
    this.integrationWorker.on("error", (error) =>
      this.logger.error(`Worker integração: ${error.message}`),
    );
    this.nfeSyncWorker.on("error", (error) => this.logger.error(`Worker NF-e: ${error.message}`));
    this.nfeSyncWorker.on("failed", (job, error) =>
      this.logger.error(`NF-e ${job?.data.companyId ?? "sem empresa"} falhou: ${error.message}`),
    );
    this.nfeSyncWorker.on("completed", (job) =>
      this.logger.log(`NF-e automática concluída para ${job.data.companyId}.`),
    );
    this.nfseSyncWorker.on("error", (error) => this.logger.error(`Worker NFS-e: ${error.message}`));
    this.nfseSyncWorker.on("failed", (job, error) =>
      this.logger.error(`NFS-e ${job?.data.companyId ?? "sem empresa"} falhou: ${error.message}`),
    );
    await this.refreshSchedulers();
    await this.refreshNfeSchedulers();
    await this.refreshNfseSchedulers();
    this.watchdog = setInterval(
      () =>
        void this.repairOverdueFiscalSchedulers().catch((error) =>
          this.logger.error(
            `Watchdog fiscal: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
      60_000,
    );
    this.watchdog.unref();
  }

  private async processSync(job: Job<SyncJob>) {
    let runId = job.data.runId;
    if (!runId) {
      if (!job.data.organizationId) throw new Error("Job agendado sem organização.");
      const run = await supabaseAdmin
        .from("totvs_sync_runs")
        .insert({
          organization_id: job.data.organizationId,
          connection_key: job.data.connectionKey ?? this.sqlServer.defaultKey(),
          direction: "rm_to_apfiscal",
          status: "queued",
          trigger: "schedule",
          job_id: job.id,
        })
        .select("id")
        .single();
      if (run.error) throw run.error;
      runId = run.data.id;
    } else {
      await supabaseAdmin.from("totvs_sync_runs").update({ job_id: job.id }).eq("id", runId);
    }
    if (!runId) throw new Error("Não foi possível criar a execução agendada TOTVS.");
    return this.syncService.execute(runId);
  }

  private async processIntegration(job: Job<IntegrationJob>) {
    await supabaseAdmin
      .from("totvs_integration_runs")
      .update({ job_id: job.id })
      .eq("id", job.data.runId);
    return this.integrationService.execute(job.data.runId);
  }

  private async processNfeSync(job: Job<NfeSyncJob>) {
    this.logger.log(`Iniciando NF-e automática para ${job.data.companyId} (job ${job.id}).`);
    try {
      return await this.fiscalSyncService.sync(job.data.companyId);
    } catch (error) {
      if (error instanceof HttpException && [409, 429].includes(error.getStatus())) {
        return { skipped: true, status: error.getStatus(), message: error.message };
      }
      throw error;
    }
  }

  private async processNfseSync(job: Job<NfseSyncJob>) {
    this.logger.log(`Iniciando NFS-e automática para ${job.data.companyId} (job ${job.id}).`);
    try {
      return await this.nfseSyncService.sync(job.data.companyId);
    } catch (error) {
      if (error instanceof HttpException && [409, 429].includes(error.getStatus()))
        return { skipped: true, status: error.getStatus(), message: error.message };
      throw error;
    }
  }

  async refreshSchedulers(organizationId?: string) {
    if (!this.syncQueue) return;
    let settingsQuery = supabaseAdmin
      .from("totvs_settings")
      .select("organization_id, enabled, read_sync_enabled, timezone, schedule_hours");
    if (organizationId) settingsQuery = settingsQuery.eq("organization_id", organizationId);
    const settings = await settingsQuery;
    if (settings.error) throw settings.error;
    for (const setting of settings.data ?? []) {
      const assignedKeys = [
        ...new Set(
          (await this.scopes.resolve(setting.organization_id)).map((scope) => scope.connectionKey),
        ),
      ];
      for (let hour = 0; hour < 24; hour += 1) {
        await this.syncQueue.removeJobScheduler(`totvs-sync-${setting.organization_id}-${hour}`);
        for (const key of this.sqlServer.connectionKeys())
          await this.syncQueue.removeJobScheduler(
            `totvs-sync-${setting.organization_id}-${key}-${hour}`,
          );
      }
      if (!setting.enabled || !setting.read_sync_enabled) continue;
      for (const key of assignedKeys.filter((item) => this.sqlServer.configured(item))) {
        for (const hour of setting.schedule_hours) {
          const schedulerId = `totvs-sync-${setting.organization_id}-${key}-${hour}`;
          await this.syncQueue.upsertJobScheduler(
            schedulerId,
            { pattern: `0 0 ${hour} * * *`, tz: setting.timezone },
            {
              name: "scheduled-sync",
              data: { organizationId: setting.organization_id, connectionKey: key },
            },
          );
        }
      }
    }
  }

  async refreshNfeSchedulers(organizationId?: string) {
    if (!this.nfeSyncQueue) return;
    let integrationsQuery = supabaseAdmin
      .from("empresa_integracoes_fiscais")
      .select("organization_id, company_id, ativo, automatic_sync_enabled, sync_interval_minutes");
    if (organizationId) integrationsQuery = integrationsQuery.eq("organization_id", organizationId);
    const integrations = await integrationsQuery;
    if (integrations.error) throw integrations.error;
    for (const integration of integrations.data ?? []) {
      const schedulerId = `nfe-sync-${integration.company_id}`;
      await this.nfeSyncQueue.removeJobScheduler(schedulerId);
      if (!integration.ativo || !integration.automatic_sync_enabled) continue;
      await this.nfeSyncQueue.upsertJobScheduler(
        schedulerId,
        { every: integration.sync_interval_minutes * 60_000 },
        { name: "scheduled-nfe-sync", data: { companyId: integration.company_id } },
      );
    }
  }

  async refreshNfseSchedulers(organizationId?: string) {
    if (!this.nfseSyncQueue) return;
    let query = supabaseAdmin
      .from("empresa_integracoes_fiscais")
      .select(
        "organization_id, company_id, ativo, nfse_automatic_sync_enabled, nfse_sync_interval_minutes",
      );
    if (organizationId) query = query.eq("organization_id", organizationId);
    const integrations = await query;
    if (integrations.error) throw integrations.error;
    for (const integration of integrations.data ?? []) {
      const schedulerId = `nfse-sync-${integration.company_id}`;
      await this.nfseSyncQueue.removeJobScheduler(schedulerId);
      if (!integration.ativo || !integration.nfse_automatic_sync_enabled) continue;
      await this.nfseSyncQueue.upsertJobScheduler(
        schedulerId,
        { every: integration.nfse_sync_interval_minutes * 60_000 },
        { name: "scheduled-nfse-sync", data: { companyId: integration.company_id } },
      );
    }
  }

  private async repairOverdueFiscalSchedulers() {
    const repair = async (
      queue: Queue<NfeSyncJob> | Queue<NfseSyncJob> | null,
      label: string,
      refresh: () => Promise<void>,
    ) => {
      if (!queue) return;
      const schedulers = await queue.getJobSchedulers(0, 999, true);
      const overdue = schedulers.filter(
        (scheduler) => scheduler.next && scheduler.next < Date.now() - 120_000,
      );
      if (!overdue.length) return;
      this.logger.warn(`${overdue.length} agendamento(s) ${label} atrasados serão recriados.`);
      for (const scheduler of overdue) await queue.removeJobScheduler(scheduler.key);
      await refresh();
    };
    await repair(this.nfeSyncQueue, "NF-e", () => this.refreshNfeSchedulers());
    await repair(this.nfseSyncQueue, "NFS-e", () => this.refreshNfseSchedulers());
  }

  async nfeSchedulerStatus() {
    if (!this.nfeSyncQueue && !this.nfseSyncQueue)
      return {
        configured: false,
        workers: 0,
        schedulers: [] as Array<{ key: string; next: string | null }>,
      };
    const [nfeSchedulers, nfseSchedulers, nfeWorkers, nfseWorkers] = await Promise.all([
      this.nfeSyncQueue?.getJobSchedulers(0, 999, true) ?? [],
      this.nfseSyncQueue?.getJobSchedulers(0, 999, true) ?? [],
      this.nfeSyncQueue?.getWorkers() ?? [],
      this.nfseSyncQueue?.getWorkers() ?? [],
    ]);
    return {
      configured: true,
      workers: nfeWorkers.length + nfseWorkers.length,
      schedulers: [...nfeSchedulers, ...nfseSchedulers].map((scheduler) => ({
        key: scheduler.key,
        next: scheduler.next ? new Date(scheduler.next).toISOString() : null,
      })),
    };
  }

  async enqueueNfeSync(companyId: string) {
    if (!this.nfeSyncQueue)
      throw new ServiceUnavailableException("Configure REDIS_URL para habilitar a fila nfe-sync.");
    const state = await supabaseAdmin
      .from("fiscal_distribution_state")
      .select("next_allowed_sync_at")
      .eq("company_id", companyId)
      .maybeSingle();
    if (state.error) throw state.error;
    const nextAllowed = state.data?.next_allowed_sync_at
      ? new Date(state.data.next_allowed_sync_at)
      : null;
    if (nextAllowed && nextAllowed > new Date()) throw cooldownException("A SEFAZ", nextAllowed);
    const job = await this.nfeSyncQueue.add(
      "manual-nfe-sync",
      { companyId },
      { jobId: `manual-nfe-${companyId}-${Math.floor(Date.now() / 60_000)}` },
    );
    return { jobId: job.id, status: "queued" as const };
  }

  async enqueueNfseSync(companyId: string) {
    if (!this.nfseSyncQueue)
      throw new ServiceUnavailableException("Configure REDIS_URL para habilitar a fila nfse-sync.");
    const integration = await supabaseAdmin
      .from("empresa_integracoes_fiscais")
      .select("nfse_next_allowed_sync_at")
      .eq("company_id", companyId)
      .maybeSingle();
    if (integration.error) throw integration.error;
    const nextAllowed = integration.data?.nfse_next_allowed_sync_at
      ? new Date(integration.data.nfse_next_allowed_sync_at)
      : null;
    if (nextAllowed && nextAllowed > new Date())
      throw cooldownException("O Ambiente de Dados Nacional da NFS-e", nextAllowed);
    const job = await this.nfseSyncQueue.add(
      "manual-nfse-sync",
      { companyId },
      { jobId: `manual-nfse-${companyId}-${Math.floor(Date.now() / 60_000)}` },
    );
    return { jobId: job.id, status: "queued" as const };
  }

  async enqueueSync(input: {
    organizationId: string;
    connectionKey?: string;
    userId?: string;
    trigger: "manual" | "schedule" | "retry" | "system";
  }) {
    if (!this.syncQueue)
      throw new ServiceUnavailableException(
        "Configure REDIS_URL para habilitar a fila totvs-sync.",
      );
    const active = await supabaseAdmin
      .from("totvs_sync_runs")
      .select("id, status")
      .eq("organization_id", input.organizationId)
      .eq("connection_key", input.connectionKey ?? this.sqlServer.defaultKey())
      .eq("direction", "rm_to_apfiscal")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active.error) throw active.error;
    if (active.data) return { runId: active.data.id, status: active.data.status, idempotent: true };
    const run = await supabaseAdmin
      .from("totvs_sync_runs")
      .insert({
        organization_id: input.organizationId,
        connection_key: input.connectionKey ?? this.sqlServer.defaultKey(),
        direction: "rm_to_apfiscal",
        status: "queued",
        trigger: input.trigger,
        created_by: input.userId ?? null,
      })
      .select("id")
      .single();
    if (run.error) throw run.error;
    const job = await this.syncQueue.add(
      "full-sync",
      { runId: run.data.id },
      { jobId: `sync-${run.data.id}` },
    );
    await supabaseAdmin.from("totvs_sync_runs").update({ job_id: job.id }).eq("id", run.data.id);
    return { runId: run.data.id, status: "queued", idempotent: false };
  }

  async enqueueIntegration(input: {
    organizationId: string;
    companyId: string;
    documentId: string;
    accessKey: string;
    userId: string;
  }) {
    if (!this.integrationQueue)
      throw new ServiceUnavailableException(
        "Configure REDIS_URL para habilitar a fila totvs-integration.",
      );
    const scope = await this.scopes.company(input.organizationId, input.companyId);
    const idempotencyKey =
      scope.connectionKey === scope.baseConnectionKey
        ? `${input.companyId}-${input.accessKey}`
        : `${scope.connectionKey}-${input.companyId}-${input.accessKey}`;
    const previous = await supabaseAdmin
      .from("totvs_integration_runs")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data && previous.data.status !== "failed")
      return { runId: previous.data.id, status: previous.data.status, idempotent: true };
    if (previous.data?.status === "failed") {
      const retriedAt = new Date().toISOString();
      const reset = await supabaseAdmin
        .from("totvs_integration_runs")
        .update({
          status: "queued",
          created_at: retriedAt,
          started_at: null,
          finished_at: null,
          error_message: null,
          response_payload: null,
        })
        .eq("id", previous.data.id);
      if (reset.error) throw reset.error;
      const job = await this.integrationQueue.add(
        "retry-integration",
        { runId: previous.data.id },
        { jobId: `integration-${previous.data.id}-${Date.now()}` },
      );
      const jobUpdate = await supabaseAdmin
        .from("totvs_integration_runs")
        .update({ job_id: job.id })
        .eq("id", previous.data.id);
      if (jobUpdate.error) throw jobUpdate.error;
      return { runId: previous.data.id, status: "queued", idempotent: false };
    }
    const run = await supabaseAdmin
      .from("totvs_integration_runs")
      .insert({
        organization_id: input.organizationId,
        connection_key: scope.connectionKey,
        company_id: input.companyId,
        fiscal_document_id: input.documentId,
        idempotency_key: idempotencyKey,
        status: "queued",
        created_by: input.userId,
      })
      .select("id")
      .single();
    if (run.error) throw run.error;
    const job = await this.integrationQueue.add(
      "integrate-nfe",
      { runId: run.data.id },
      { jobId: `integration-${run.data.id}` },
    );
    await supabaseAdmin
      .from("totvs_integration_runs")
      .update({ job_id: job.id })
      .eq("id", run.data.id);
    return { runId: run.data.id, status: "queued", idempotent: false };
  }

  async onModuleDestroy() {
    if (this.watchdog) clearInterval(this.watchdog);
    await Promise.all([
      this.syncWorker?.close(),
      this.integrationWorker?.close(),
      this.nfeSyncWorker?.close(),
      this.nfseSyncWorker?.close(),
      this.syncQueue?.close(),
      this.integrationQueue?.close(),
      this.nfeSyncQueue?.close(),
      this.nfseSyncQueue?.close(),
    ]);
  }
}
