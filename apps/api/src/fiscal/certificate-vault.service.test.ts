import forge from "node-forge";
import { beforeAll, describe, expect, it } from "vitest";
import { CertificateVaultService } from "./certificate-vault.service";

const password = "senha-segura";
let pkcs12Buffer: Buffer;

beforeAll(() => {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date(Date.now() - 60_000);
  certificate.validity.notAfter = new Date(Date.now() + 86_400_000);
  const subject = [{ name: "commonName", value: "APFiscal 12345678000199" }];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(keys.privateKey, forge.md.sha256.create());

  const pkcs12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], password, { algorithm: "3des" });
  pkcs12Buffer = Buffer.from(forge.asn1.toDer(pkcs12).getBytes(), "binary");
});

describe("CertificateVaultService.inspectPkcs12", () => {
  const vault = new CertificateVaultService();

  it("valida o PKCS#12 e extrai validade e CNPJ", () => {
    const inspected = vault.inspectPkcs12(pkcs12Buffer, password);

    expect(inspected.subjectCnpj).toBe("12345678000199");
    expect(inspected.daysRemaining).toBeGreaterThanOrEqual(1);
    expect(inspected.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejeita senha incorreta sem expor detalhes criptográficos", () => {
    expect(() => vault.inspectPkcs12(pkcs12Buffer, "incorreta")).toThrow(
      "Não foi possível abrir o certificado. Confira o arquivo e a senha informada.",
    );
  });
});
