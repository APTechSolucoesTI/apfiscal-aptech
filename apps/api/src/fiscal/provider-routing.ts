import type { NfeProviderKind } from "@apfiscal/shared";
import { ProviderUnavailableError } from "./provider-unavailable.error";

export type ProviderRoutingConfig = {
  primary_provider: NfeProviderKind;
  fallback_provider: NfeProviderKind | null;
  fallback_enabled: boolean;
  certificate_storage_path: string | null;
  certificate_password_encrypted: string | null;
  api_key_encrypted: string | null;
};

export function providerConfigured(config: ProviderRoutingConfig, provider: NfeProviderKind): boolean {
  if (provider === "nfewizard") {
    return Boolean(config.certificate_storage_path && config.certificate_password_encrypted);
  }
  return Boolean(config.api_key_encrypted);
}

export function missingProviderMessage(provider: NfeProviderKind): string {
  return provider === "nfewizard"
    ? "Envie o certificado digital A1 da empresa antes de sincronizar as NF-e."
    : "O conector APFiscal não possui uma chave de API configurada para esta empresa.";
}

export function availableFallback(
  config: ProviderRoutingConfig,
  failedProvider: NfeProviderKind,
  error: unknown,
): NfeProviderKind | null {
  if (!(error instanceof ProviderUnavailableError)) return null;
  if (!config.fallback_enabled || !config.fallback_provider) return null;
  if (config.fallback_provider === failedProvider) return null;
  return providerConfigured(config, config.fallback_provider) ? config.fallback_provider : null;
}
