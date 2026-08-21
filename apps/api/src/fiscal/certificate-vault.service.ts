import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import forge from "node-forge";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "@/config/env";

const PREFIX = "v1";

function encryptionKey(): Buffer {
  const raw = env("CERTIFICATE_ENCRYPTION_KEY");
  const key = /^[a-f\d]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CERTIFICATE_ENCRYPTION_KEY deve representar exatamente 32 bytes.");
  return key;
}

@Injectable()
export class CertificateVaultService {
  private readonly logger = new Logger(CertificateVaultService.name);

  inspectPkcs12(buffer: Buffer, password: string) {
    if (!password) throw new BadRequestException("Informe a senha do certificado.");

    try {
      const asn1 = forge.asn1.fromDer(buffer.toString("binary"));
      const pkcs12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
      const certificateBags = pkcs12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
      const certificate = certificateBags.find((bag) => bag.cert)?.cert;

      if (!certificate) throw new Error("Certificado ausente no arquivo PKCS#12.");
      return this.certificateDetails(certificate);
    } catch (forgeError) {
      if (forgeError instanceof BadRequestException) throw forgeError;
      try {
        return this.inspectWithOpenSsl(buffer, password);
      } catch (openSslError) {
        // Registra apenas o tipo da falha: nunca o arquivo, a senha ou o PEM.
        this.logger.warn(`Leitura do certificado falhou (forge=${errorName(forgeError)}, openssl=${errorName(openSslError)}).`);
        throw new BadRequestException("Não foi possível abrir o certificado. Confira o arquivo e a senha informada.");
      }
    }
  }

  private inspectWithOpenSsl(buffer: Buffer, password: string) {
    const directory = mkdtempSync(join(tmpdir(), "apfiscal-certificate-"));
    const certificatePath = join(directory, "certificate.p12");
    const passwordPath = join(directory, "password");
    try {
      writeFileSync(certificatePath, buffer, { mode: 0o600 });
      writeFileSync(passwordPath, password, { mode: 0o600 });
      const pem = execFileSync(
        "openssl",
        ["pkcs12", "-in", certificatePath, "-clcerts", "-nokeys", "-passin", `file:${passwordPath}`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000, maxBuffer: 1024 * 1024 },
      );
      return this.certificateDetails(forge.pki.certificateFromPem(pem));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  private certificateDetails(certificate: forge.pki.Certificate) {
    const now = new Date();
    const expiresAt = certificate.validity.notAfter;
    if (expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException("O certificado A1 está vencido.");
    }

    const subject = certificate.subject.attributes
      .map((attribute) => `${attribute.shortName ?? attribute.name ?? attribute.type}=${attribute.value}`)
      .join(", ");

    return {
      validFrom: certificate.validity.notBefore,
      expiresAt,
      subjectCnpj: subject.match(/\d{14}/)?.[0] ?? null,
      daysRemaining: Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000),
    };
  }

  encrypt(value: string): string {
    if (!value) throw new BadRequestException("Informe a senha do certificado.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split(".");
    if (version !== PREFIX || !iv || !tag || !ciphertext) throw new Error("Senha de certificado armazenada em formato inválido.");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  }
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "unknown";
}
