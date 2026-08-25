"use client";

import { backendFetch } from "@/lib/backend";

export type TotvsSettingsPayload = {
  totvsStructure: {
    mode: "COLIGADA" | "FILIAL";
    mainColigadaId: number | null;
    homologationMode: boolean;
  };
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
  companies: Array<{
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string;
    totvs_connection_key: string | null;
    totvs_coligada_id: number | null;
    totvs_filial_id: number | null;
  }>;
  runs: Array<{
    id: string;
    connection_key: string | null;
    status: string;
    trigger: string;
    started_at: string | null;
    finished_at: string | null;
    metrics: Record<string, unknown>;
    error_message: string | null;
    created_at: string;
  }>;
  checkpoints: Array<{
    connection_key: string;
    entity: string;
    last_attempt_at: string | null;
    last_success_at: string | null;
    source_watermark: string | null;
    rows_processed: number;
    last_error: string | null;
  }>;
  integrationRuns: Array<{
    id: string;
    fiscal_document_id: string;
    status: string;
    attempt: number;
    rm_record_id: string | null;
    error_message: string | null;
    created_at: string;
  }>;
  nfeSchedules: Array<{
    company_id: string;
    ativo: boolean;
    automatic_sync_enabled: boolean;
    sync_interval_minutes: number;
    primary_provider: string;
    nfse_provider: "nacional_adn" | "sigiss" | "municipal";
    nfse_automatic_sync_enabled: boolean;
    nfse_sync_interval_minutes: number;
    nfse_last_sync_at: string | null;
    nfse_last_error: string | null;
    nfse_next_allowed_sync_at: string | null;
  }>;
  fiscalStates: Array<{
    company_id: string;
    last_sync_at: string | null;
    next_allowed_sync_at: string | null;
    last_cstat: string | null;
    last_error: string | null;
  }>;
  accountPlan: {
    plan: { key: string; name: string };
    limits: {
      maxUsers: number | null;
      maxCompanies: number | null;
      maxMonthlyDocuments: number | null;
      maxTotvsConnections: number | null;
    };
    features: Record<string, boolean>;
  };
  fiscalRuns: Array<{
    id: string;
    company_id: string;
    acao: string;
    sucesso: boolean;
    mensagem: string | null;
    payload_bruto: Record<string, unknown> | null;
    created_at: string;
  }>;
  scheduler: {
    configured: boolean;
    workers: number;
    schedulers: Array<{ key: string; next: string | null }>;
  };
  environment: {
    sqlConfigured: boolean;
    redisConfigured: boolean;
    writesEnabled: boolean;
    coligadas: number[];
    defaultConnectionKey: string;
    connections: Array<{
      key: string;
      effectiveKey: string;
      description: string;
      database: string | null;
      configured: boolean;
      writesEnabled: boolean;
      coligadas: number[];
      homologation: boolean;
    }>;
  };
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
  companyMappings: Array<{
    companyId: string;
    connectionKey: string | null;
    coligadaId: number | null;
    filialId: number | null;
  }>;
  nfeSchedules: Array<{ companyId: string; enabled: boolean; intervalMinutes: number }>;
  nfseSchedules: Array<{
    companyId: string;
    enabled: boolean;
    intervalMinutes: number;
    provider: "nacional_adn" | "sigiss" | "municipal";
  }>;
}) {
  return backendFetch<{ ok: true }>("/synchronizations/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function testTotvsConnection(connectionKey?: string) {
  return backendFetch<{ ok: true; database: string }>("/synchronizations/test-connection", {
    method: "POST",
    body: JSON.stringify({ connectionKey }),
  });
}

export function enqueueTotvsSync(connectionKey?: string) {
  return backendFetch<{ runId: string; status: string; idempotent: boolean }>(
    "/synchronizations/sync",
    { method: "POST", body: JSON.stringify({ connectionKey }) },
  );
}

export const enqueueNfeSync = (companyId: string) =>
  backendFetch(`/synchronizations/nfe-sync/${companyId}`, { method: "POST" });
export const testNfseConnection = (companyId: string) =>
  backendFetch<{ ok: boolean; message: string }>(`/synchronizations/nfse-test/${companyId}`, {
    method: "POST",
  });
export const enqueueNfseSync = (companyId: string) =>
  backendFetch(`/synchronizations/nfse-sync/${companyId}`, { method: "POST" });
