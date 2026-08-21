"use client";

import { backendFetch } from "@/lib/backend";

export type TotvsSettingsPayload = {
  settings: {
    enabled: boolean;
    read_sync_enabled: boolean;
    integration_enabled: boolean;
    timezone: string;
    schedule_hours: number[];
    safety_window_days: number;
    last_connection_test_at?: string | null;
    last_connection_test_ok?: boolean | null;
    last_connection_error?: string | null;
  };
  companies: Array<{ id: string; razao_social: string; nome_fantasia: string | null; cnpj: string; totvs_coligada_id: number | null }>;
  runs: Array<{ id: string; status: string; trigger: string; started_at: string | null; finished_at: string | null; metrics: Record<string, unknown>; error_message: string | null; created_at: string }>;
  checkpoints: Array<{ entity: string; last_attempt_at: string | null; last_success_at: string | null; source_watermark: string | null; rows_processed: number; last_error: string | null }>;
  integrationRuns: Array<{ id: string; fiscal_document_id: string; status: string; attempt: number; rm_record_id: string | null; error_message: string | null; created_at: string }>;
  nfeSchedules: Array<{ company_id: string; ativo: boolean; automatic_sync_enabled: boolean; sync_interval_minutes: number; primary_provider: string }>;
  fiscalRuns: Array<{ id: string; company_id: string; acao: string; sucesso: boolean; mensagem: string | null; payload_bruto: Record<string, unknown> | null; created_at: string }>;
  environment: { sqlConfigured: boolean; redisConfigured: boolean; writesEnabled: boolean; coligadas: number[] };
};

export function getTotvsSettings() {
  return backendFetch<TotvsSettingsPayload>("/synchronizations/settings");
}

export function saveTotvsSettings(input: {
  enabled: boolean;
  readSyncEnabled: boolean;
  integrationEnabled: boolean;
  timezone: string;
  scheduleHours: number[];
  safetyWindowDays: number;
  companyMappings: Array<{ companyId: string; coligadaId: number | null }>;
  nfeSchedules: Array<{ companyId: string; enabled: boolean; intervalMinutes: number }>;
}) {
  return backendFetch<{ ok: true }>("/synchronizations/settings", { method: "PATCH", body: JSON.stringify(input) });
}

export function testTotvsConnection() {
  return backendFetch<{ ok: true; database: string }>("/synchronizations/test-connection", { method: "POST" });
}

export function enqueueTotvsSync() {
  return backendFetch<{ runId: string; status: string; idempotent: boolean }>("/synchronizations/sync", { method: "POST" });
}
