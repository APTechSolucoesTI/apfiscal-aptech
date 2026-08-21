import { execFileSync } from "node:child_process";
import * as forge from "node-forge";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CertificateVaultService, certificateMatchesCompany } from "./certificate-vault.service";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

const password = "senha-segura";
let pkcs12Buffer: Buffer;
let certificate: forge.pki.Certificate;

beforeAll(() => {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date(Date.now() - 60_000);
  certificate.validity.notAfter = new Date(Date.now() + 86_400_000);
  const subject = [
    { name: "organizationalUnitName", value: "Autoridade 62226170000146" },
    { name: "commonName", value: "APFiscal:12345678000199" },
  ];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(keys.privateKey, forge.md.sha256.create());

  const pkcs12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], password, { algorithm: "3des" });
  pkcs12Buffer = Buffer.from(forge.asn1.toDer(pkcs12).getBytes(), "binary");
});

afterEach(() => vi.mocked(execFileSync).mockReset());

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

  it("usa OpenSSL como fallback para PKCS#12 que o node-forge não consegue ler", () => {
    vi.mocked(execFileSync).mockReturnValue(forge.pki.certificateToPem(certificate) as never);

    const inspected = vault.inspectPkcs12(Buffer.from("pkcs12-com-criptografia-moderna"), password);

    expect(inspected.subjectCnpj).toBe("12345678000199");
    expect(execFileSync).toHaveBeenCalledWith(
      "openssl",
      expect.arrayContaining(["pkcs12", "-clcerts", "-nokeys"]),
      expect.objectContaining({ timeout: 10_000 }),
    );
  });
});

describe("certificateMatchesCompany", () => {
  it("aceita certificado de matriz ou filial com a mesma raiz de CNPJ", () => {
    expect(certificateMatchesCompany("08168210000286", "08.168.210/0001-03")).toBe(true);
  });

  it("rejeita certificado pertencente a outra raiz de CNPJ", () => {
    expect(certificateMatchesCompany("17382391000199", "08.168.210/0001-03")).toBe(false);
  });
});
