import { describe, expect, it } from "vitest";
import { ProviderPreparationError } from "./provider-preparation.error";
import { ProviderUnavailableError } from "./provider-unavailable.error";
import { availableFallback, providerConfigured, type ProviderRoutingConfig } from "./provider-routing";

const configured: ProviderRoutingConfig = {
  primary_provider: "nfewizard",
  fallback_provider: "apifiscal",
  fallback_enabled: true,
  certificate_storage_path: "certificates/company/a1.pfx",
  certificate_password_encrypted: "encrypted-password",
  api_key_encrypted: "encrypted-api-key",
};

describe("provider routing", () => {
  it("não usa o legado quando o NFeWizard não foi configurado", () => {
    expect(availableFallback(configured, "nfewizard", new ProviderPreparationError("Certificado ausente"))).toBeNull();
  });

  it("usa o legado somente em indisponibilidade operacional", () => {
    expect(availableFallback(configured, "nfewizard", new ProviderUnavailableError("Serviço indisponível"))).toBe("apifiscal");
  });

  it("não usa um fallback sem chave de API", () => {
    const withoutLegacy = { ...configured, api_key_encrypted: null };
    expect(providerConfigured(withoutLegacy, "apifiscal")).toBe(false);
    expect(availableFallback(withoutLegacy, "nfewizard", new ProviderUnavailableError("Serviço indisponível"))).toBeNull();
  });

  it("exige arquivo e senha criptografada para considerar o NFeWizard configurado", () => {
    expect(providerConfigured({ ...configured, certificate_password_encrypted: null }, "nfewizard")).toBe(false);
    expect(providerConfigured(configured, "nfewizard")).toBe(true);
  });
});
