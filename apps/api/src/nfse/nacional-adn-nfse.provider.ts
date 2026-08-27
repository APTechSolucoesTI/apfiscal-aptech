import { Agent, request } from "node:https";
import { Injectable } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CertificateVaultService } from "@/fiscal/certificate-vault.service";
import type { NfseProvider } from "./nfse-provider";
import { parseAdnBatch } from "./nfse-adn-parser";
import {
  ExternalRateLimitError,
  friendlyExternalError,
  retryAfterDate,
} from "@/common/sync-feedback";

@Injectable()
export class NacionalAdnNfseProvider implements NfseProvider {
  readonly kind = "nacional_adn";
  constructor(private readonly vault: CertificateVaultService) {}

  private async context(companyId: string) {
    const [company, integration] = await Promise.all([
      supabaseAdmin.from("companies").select("cnpj").eq("id", companyId).single(),
      supabaseAdmin
        .from("empresa_integracoes_fiscais")
        .select("certificate_storage_path, certificate_password_encrypted")
        .eq("company_id", companyId)
        .single(),
    ]);
    if (company.error) throw company.error;
    if (integration.error) throw integration.error;
    const path = String(integration.data.certificate_storage_path ?? "");
    const encrypted = String(integration.data.certificate_password_encrypted ?? "");
    if (!path || !encrypted)
      throw new Error("Configure o certificado A1 da empresa antes de consultar NFS-e.");
    const downloaded = await supabaseAdmin.storage.from("fiscal-xml").download(path);
    if (downloaded.error) throw downloaded.error;
    return {
      pfx: Buffer.from(await downloaded.data.arrayBuffer()),
      passphrase: this.vault.decrypt(encrypted),
      cnpj: String(company.data.cnpj).replace(/\D/g, ""),
    };
  }

  private async get(companyId: string, path: string) {
    const context = await this.context(companyId);
    const base = new URL(process.env.NFSE_ADN_BASE_URL ?? "https://adn.nfse.gov.br/contribuintes");
    const timeout = Number(process.env.NFSE_ADN_TIMEOUT_MS ?? 30_000);
    // O ADN encerra de forma inconsistente sessÃµes TLS 1.3 retomadas pelo
    // OpenSSL 3/Node 24. Uma sessÃ£o TLS 1.2 nova por consulta evita o
    // `bad record mac` sem alterar NSU nem o conteÃºdo fiscal consultado.
    const agent = new Agent({
      pfx: context.pfx,
      passphrase: context.passphrase,
      keepAlive: false,
      maxCachedSessions: 0,
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.2",
    });
    return new Promise<{
      status: number;
      contentType: string | null;
      retryAfter: string | undefined;
      body: Buffer;
    }>((resolve, reject) => {
      const req = request(
        new URL(`${base.toString().replace(/\/$/, "")}${path}`),
        {
          method: "GET",
          agent,
          headers: {
            accept: "application/json, application/xml, text/xml, application/octet-stream",
            "user-agent": "APFiscal-NFSe-ADN/1.0",
          },
          timeout,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) =>
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
          );
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 500,
              contentType:
                typeof response.headers["content-type"] === "string"
                  ? response.headers["content-type"]
                  : null,
              retryAfter:
                typeof response.headers["retry-after"] === "string"
                  ? response.headers["retry-after"]
                  : undefined,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on("timeout", () => req.destroy(new Error("Timeout ao consultar o ADN NFS-e.")));
      req.on("error", reject);
      req.end();
    });
  }

  async test(companyId: string) {
    // The distribution endpoint consumes the provider quota. Probe the official
    // documentation route instead, which still validates mTLS without advancing NSU.
    let response: Awaited<ReturnType<NacionalAdnNfseProvider["get"]>>;
    try {
      response = await this.get(companyId, "/docs/index.html");
    } catch {
      return {
        ok: false,
        message:
          "O ADN nÃ£o concluiu a conexÃ£o segura com o certificado neste momento. Tente novamente em alguns minutos.",
      };
    }
    if (response.status === 200)
      return {
        ok: true,
        message:
          "Certificado A1 aceito pelo Ambiente de Dados Nacional. O teste não consumiu uma consulta de distribuição.",
      };
    const retryAt = response.status === 429 ? retryAfterDate(response.retryAfter) : undefined;
    return {
      ok: false,
      message: friendlyExternalError(
        "O Ambiente de Dados Nacional da NFS-e",
        response.status,
        retryAt,
      ),
      retryAt: retryAt?.toISOString() ?? null,
    };
  }

  async fetch(companyId: string, nsu: number) {
    const response = await this.get(companyId, `/DFe/${nsu}`);
    if ([204, 404].includes(response.status))
      return { status: "SEM_DOCUMENTOS", documents: [], located: 0, lastNsu: nsu, warnings: [] };
    if (response.status === 429)
      throw new ExternalRateLimitError(
        "Limite de consultas do ADN NFS-e atingido.",
        retryAfterDate(response.retryAfter),
        "O Ambiente de Dados Nacional da NFS-e",
      );
    if (response.status !== 200)
      throw new Error(
        friendlyExternalError("O Ambiente de Dados Nacional da NFS-e", response.status),
      );
    return parseAdnBatch(response.body, nsu);
  }
}
