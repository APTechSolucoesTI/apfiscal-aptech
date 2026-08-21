import { Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TotvsIntegrationService } from "./totvs-integration.service";
import { TotvsSyncService } from "./totvs-sync.service";

type SyncJob = { runId?: string; organizationId?: string };
type IntegrationJob = { runId: string };

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
  private syncQueue: Queue<SyncJob> | null = null;
  private integrationQueue: Queue<IntegrationJob> | null = null;
  private syncWorker: Worker<SyncJob> | null = null;
  private integrationWorker: Worker<IntegrationJob> | null = null;

  constructor(
    private readonly syncService: TotvsSyncService,
    private readonly integrationService: TotvsIntegrationService,
  ) {}

  configured(): boolean {
    return Boolean(redisConnection());
  }

  async onModuleInit() {
    const connection = redisConnection();
    if (!connection) return;
    this.syncQueue = new Queue<SyncJob>("totvs-sync", { connection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: 500, removeOnFail: 500 } });
    this.integrationQueue = new Queue<IntegrationJob>("totvs-integration", { connection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 500, removeOnFail: 500 } });
    this.syncWorker = new Worker<SyncJob>("totvs-sync", (job) => this.processSync(job), { connection, concurrency: 1 });
    this.integrationWorker = new Worker<IntegrationJob>("totvs-integration", (job) => this.processIntegration(job), { connection, concurrency: 1 });
    this.syncWorker.on("error", () => undefined);
    this.integrationWorker.on("error", () => undefined);
    await this.refreshSchedulers();
  }

  private async processSync(job: Job<SyncJob>) {
    let runId = job.data.runId;
    if (!runId) {
      if (!job.data.organizationId) throw new Error("Job agendado sem organização.");
      const run = await supabaseAdmin.from("totvs_sync_runs").insert({
        organization_id: job.data.organizationId,
        direction: "rm_to_apfiscal",
        status: "queued",
        trigger: "schedule",
        job_id: job.id,
      }).select("id").single();
      if (run.error) throw run.error;
      runId = run.data.id;
    } else {
      await supabaseAdmin.from("totvs_sync_runs").update({ job_id: job.id }).eq("id", runId);
    }
    if (!runId) throw new Error("Não foi possível criar a execução agendada TOTVS.");
    return this.syncService.execute(runId);
  }

  private async processIntegration(job: Job<IntegrationJob>) {
    await supabaseAdmin.from("totvs_integration_runs").update({ job_id: job.id }).eq("id", job.data.runId);
    return this.integrationService.execute(job.data.runId);
  }

  async refreshSchedulers(organizationId?: string) {
    if (!this.syncQueue) return;
    let settingsQuery = supabaseAdmin.from("totvs_settings")
      .select("organization_id, enabled, read_sync_enabled, timezone, schedule_hours");
    if (organizationId) settingsQuery = settingsQuery.eq("organization_id", organizationId);
    const settings = await settingsQuery;
    if (settings.error) throw settings.error;
    for (const setting of settings.data ?? []) {
      for (let hour = 0; hour < 24; hour += 1) {
        await this.syncQueue.removeJobScheduler(`totvs-sync-${setting.organization_id}-${hour}`);
      }
      if (!setting.enabled || !setting.read_sync_enabled) continue;
      for (const hour of setting.schedule_hours) {
        const schedulerId = `totvs-sync-${setting.organization_id}-${hour}`;
        await this.syncQueue.upsertJobScheduler(
          schedulerId,
          { pattern: `0 0 ${hour} * * *`, tz: setting.timezone, startDate: new Date(Date.now() + 60_000) },
          { name: "scheduled-sync", data: { organizationId: setting.organization_id } },
        );
      }
    }
  }

  async enqueueSync(input: { organizationId: string; userId?: string; trigger: "manual" | "schedule" | "retry" | "system" }) {
    if (!this.syncQueue) throw new ServiceUnavailableException("Configure REDIS_URL para habilitar a fila totvs-sync.");
    const active = await supabaseAdmin.from("totvs_sync_runs")
      .select("id, status")
      .eq("organization_id", input.organizationId)
      .eq("direction", "rm_to_apfiscal")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active.error) throw active.error;
    if (active.data) return { runId: active.data.id, status: active.data.status, idempotent: true };
    const run = await supabaseAdmin.from("totvs_sync_runs").insert({
      organization_id: input.organizationId,
      direction: "rm_to_apfiscal",
      status: "queued",
      trigger: input.trigger,
      created_by: input.userId ?? null,
    }).select("id").single();
    if (run.error) throw run.error;
    const job = await this.syncQueue.add("full-sync", { runId: run.data.id }, { jobId: `sync-${run.data.id}` });
    await supabaseAdmin.from("totvs_sync_runs").update({ job_id: job.id }).eq("id", run.data.id);
    return { runId: run.data.id, status: "queued", idempotent: false };
  }

  async enqueueIntegration(input: { organizationId: string; companyId: string; documentId: string; accessKey: string; userId: string }) {
    if (!this.integrationQueue) throw new ServiceUnavailableException("Configure REDIS_URL para habilitar a fila totvs-integration.");
    const idempotencyKey = `${input.companyId}-${input.accessKey}`;
    const previous = await supabaseAdmin.from("totvs_integration_runs")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data) return { runId: previous.data.id, status: previous.data.status, idempotent: true };
    const run = await supabaseAdmin.from("totvs_integration_runs").insert({
      organization_id: input.organizationId,
      company_id: input.companyId,
      fiscal_document_id: input.documentId,
      idempotency_key: idempotencyKey,
      status: "queued",
      created_by: input.userId,
    }).select("id").single();
    if (run.error) throw run.error;
    const job = await this.integrationQueue.add("integrate-nfe", { runId: run.data.id }, { jobId: `integration-${run.data.id}` });
    await supabaseAdmin.from("totvs_integration_runs").update({ job_id: job.id }).eq("id", run.data.id);
    return { runId: run.data.id, status: "queued", idempotent: false };
  }

  async onModuleDestroy() {
    await Promise.all([
      this.syncWorker?.close(), this.integrationWorker?.close(), this.syncQueue?.close(), this.integrationQueue?.close(),
    ]);
  }
}
