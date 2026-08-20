"use client";

import type { NfeProviderKind } from "@apfiscal/shared";
import { backendFetch } from "@/lib/backend";

export type FiscalIntegrationSettings = {
  ativo: boolean;
  primary_provider: NfeProviderKind;
  fallback_provider: NfeProviderKind | null;
  fallback_enabled: boolean;
  certificateConfigured: boolean;
  certificate_expires_at: string | null;
  api_key_last4: string | null;
  apifiscalConfigured: boolean;
  apifiscal_certificate_last_error: string | null;
  checkpoint: { last_nsu: number; last_sync_at: string | null; next_allowed_sync_at: string | null; last_cstat: string | null; last_error: string | null } | null;
};

export function getFiscalSettings(companyId: string) {
  return backendFetch<FiscalIntegrationSettings>(`/fiscal-integration/settings/${companyId}`);
}

export function saveFiscalSettings(companyId: string, input: { primaryProvider: NfeProviderKind; fallbackProvider: NfeProviderKind | null; fallbackEnabled: boolean; active: boolean }) {
  return backendFetch<{ ok: true }>(`/fiscal-integration/settings/${companyId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function testFiscalProvider(companyId: string, provider: NfeProviderKind) {
  return backendFetch<{ provider: NfeProviderKind; ok: boolean; message: string }>(`/fiscal-integration/test/${companyId}`, { method: "POST", body: JSON.stringify({ provider }) });
}

export function uploadNfeWizardCertificate(companyId: string, certificate: File, password: string) {
  const body = new FormData();
  body.append("certificate", certificate, certificate.name);
  body.append("password", password);
  return backendFetch<{
    ok: true;
    expiresAt: string;
    daysRemaining: number;
    apifiscal: { configured: boolean; message: string };
  }>(`/fiscal-integration/certificate/${companyId}`, { method: "POST", body });
}
