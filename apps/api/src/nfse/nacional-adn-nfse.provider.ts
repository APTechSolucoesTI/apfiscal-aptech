import { createHash } from "node:crypto";
import { request } from "node:https";
import { Injectable } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CertificateVaultService } from "@/fiscal/certificate-vault.service";
import type { NfseDocument, NfseProvider } from "./nfse-provider";

@Injectable()
export class NacionalAdnNfseProvider implements NfseProvider {
  readonly kind = "nacional_adn";
  constructor(private readonly vault: CertificateVaultService) {}

  private async context(companyId: string) {
    const [company, integration] = await Promise.all([
      supabaseAdmin.from("companies").select("cnpj").eq("id", companyId).single(),
      supabaseAdmin.from("empresa_integracoes_fiscais").select("certificate_storage_path, certificate_password_encrypted").eq("company_id", companyId).single(),
    ]);
    if (company.error) throw company.error;
    if (integration.error) throw integration.error;
    const path = String(integration.data.certificate_storage_path ?? "");
    const encrypted = String(integration.data.certificate_password_encrypted ?? "");
    if (!path || !encrypted) throw new Error("Configure o certificado A1 da empresa antes de consultar NFS-e.");
    const downloaded = await supabaseAdmin.storage.from("fiscal-xml").download(path);
    if (downloaded.error) throw downloaded.error;
    return { pfx: Buffer.from(await downloaded.data.arrayBuffer()), passphrase: this.vault.decrypt(encrypted), cnpj: String(company.data.cnpj).replace(/\D/g, "") };
  }

  private async get(companyId: string, path: string) {
    const context = await this.context(companyId);
    const base = new URL(process.env.NFSE_ADN_BASE_URL ?? "https://adn.nfse.gov.br/contribuintes");
    const timeout = Number(process.env.NFSE_ADN_TIMEOUT_MS ?? 30_000);
    return new Promise<{ status: number; contentType: string | null; body: Buffer }>((resolve, reject) => {
      const req = request(new URL(`${base.toString().replace(/\/$/, "")}${path}`), {
        method: "GET", pfx: context.pfx, passphrase: context.passphrase,
        headers: { accept: "application/json, application/xml, text/xml, application/octet-stream", "user-agent": "APFiscal-NFSe-ADN/1.0" },
        timeout,
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("end", () => resolve({ status: response.statusCode ?? 500, contentType: typeof response.headers["content-type"] === "string" ? response.headers["content-type"] : null, body: Buffer.concat(chunks) }));
      });
      req.on("timeout", () => req.destroy(new Error("Timeout ao consultar o ADN NFS-e.")));
      req.on("error", reject);
      req.end();
    });
  }

  async test(companyId: string) {
    const response = await this.get(companyId, "/DFe/0");
    if ([200, 204, 404].includes(response.status)) return { ok: true, message: `ADN NFS-e respondeu HTTP ${response.status}.` };
    return { ok: false, message: `ADN NFS-e respondeu HTTP ${response.status}.` };
  }

  async fetch(companyId: string, nsu: number): Promise<NfseDocument | null> {
    const response = await this.get(companyId, `/DFe/${nsu}`);
    if ([204, 404].includes(response.status)) return null;
    if (response.status !== 200) throw new Error(`ADN NFS-e recusou a consulta do NSU ${nsu} (HTTP ${response.status}).`);
    const textual = /json|xml|text/i.test(response.contentType ?? "");
    const rawDocument = textual ? response.body.toString("utf8") : response.body.toString("base64");
    const accessKey = rawDocument.match(/\b\d{50}\b/)?.[0] ?? null;
    return { nsu, accessKey, contentType: response.contentType, rawDocument, payloadHash: createHash("sha256").update(response.body).digest("hex") };
  }
}
