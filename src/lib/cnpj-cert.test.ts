import { describe, it, expect } from "vitest";
import forge from "node-forge";
import { extractCnpjFromCert, isValidCnpj, OID_ICPBR_CNPJ } from "./cnpj-cert";

// CNPJ válido conhecido (Petrobras): 33.000.167/0001-01
const VALID_CNPJ = "33000167000101";
const OTHER_VALID_CNPJ = "11222333000181"; // válido pelos DV
const INVALID_14 = "00001010104140"; // 14 dígitos que apareciam no fallback bugado

function buildCert(opts: {
  cn?: string;
  sanIcpDataPrefix?: string; // 8 dígitos AAAAMMDD antes do CNPJ
  sanCnpj?: string | null;
  extraSanDigits?: string; // dígitos extras injetados no otherName para simular ruído
  omitSan?: boolean;
}): forge.pki.Certificate {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [{ shortName: "CN", value: opts.cn ?? "TESTE" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  if (!opts.omitSan) {
    // Constrói otherName ICP-Brasil: [0] SEQ { OID, [0] EXPLICIT OCTET STRING }
    const dataPrefix = opts.sanIcpDataPrefix ?? "19700101";
    const payload = `${dataPrefix}${opts.sanCnpj ?? ""}${opts.extraSanDigits ?? ""}`;
    const otherNameValue = forge.asn1.create(
      forge.asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      [forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, payload)],
    );
    const otherName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OID,
        false,
        forge.asn1.oidToDer(OID_ICPBR_CNPJ).getBytes(),
      ),
      otherNameValue,
    ]);
    const san = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      otherName,
    ]);
    const sanDer = forge.asn1.toDer(san).getBytes();
    cert.setExtensions([
      { id: "2.5.29.17", name: "subjectAltName", value: sanDer } as unknown as forge.pki.CertificateExtension,
    ]);
  }
  cert.sign(keys.privateKey);
  return cert;
}

describe("isValidCnpj", () => {
  it("aceita CNPJs com DV correto", () => {
    expect(isValidCnpj(VALID_CNPJ)).toBe(true);
    expect(isValidCnpj(OTHER_VALID_CNPJ)).toBe(true);
  });
  it("rejeita sequência de 14 dígitos inválida", () => {
    expect(isValidCnpj(INVALID_14)).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("12345678901234")).toBe(false);
  });
  it("rejeita comprimento incorreto", () => {
    expect(isValidCnpj("3300016700010")).toBe(false);
    expect(isValidCnpj("330001670001011")).toBe(false);
  });
});

describe("extractCnpjFromCert", () => {
  it("extrai CNPJ do otherName ICP-Brasil (OID 2.16.76.1.3.3)", () => {
    const cert = buildCert({ sanCnpj: VALID_CNPJ, cn: "SEM CNPJ AQUI" });
    expect(extractCnpjFromCert(cert)).toBe(VALID_CNPJ);
  });

  it("ignora dígitos de ruído e retorna o CNPJ válido presente no SAN", () => {
    const cert = buildCert({
      sanCnpj: VALID_CNPJ,
      extraSanDigits: "9999", // dígitos extras não devem quebrar a extração
    });
    expect(extractCnpjFromCert(cert)).toBe(VALID_CNPJ);
  });

  it("não retorna sequência de 14 dígitos que não seja CNPJ válido", () => {
    // Payload contém apenas os 14 dígitos inválidos + prefixo de nascimento
    const cert = buildCert({ sanCnpj: INVALID_14, cn: "SEM CNPJ" });
    expect(extractCnpjFms(cert)).toBeNull();
  });

  it("cai no CN quando o SAN está ausente, mas só com CNPJ válido", () => {
    const cert = buildCert({ omitSan: true, cn: `EMPRESA X:${VALID_CNPJ}` });
    expect(extractCnpjFromCert(cert)).toBe(VALID_CNPJ);
  });

  it("retorna null quando CN contém apenas dígitos inválidos", () => {
    const cert = buildCert({ omitSan: true, cn: `EMPRESA:${INVALID_14}` });
    expect(extractCnpjFromCert(cert)).toBeNull();
  });

  it("retorna null quando não há SAN nem CNPJ no CN", () => {
    const cert = buildCert({ omitSan: true, cn: "EMPRESA SEM CNPJ" });
    expect(extractCnpjFromCert(cert)).toBeNull();
  });

  it("não confunde OID diferente do ICP-Brasil", () => {
    // Recria um cert com OID errado — não deve extrair nada
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "02";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 3600_000);
    const attrs = [{ shortName: "CN", value: "SEM CNPJ" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    const wrongOid = "1.2.3.4.5";
    const otherNameValue = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OCTETSTRING,
        false,
        `19700101${VALID_CNPJ}`,
      ),
    ]);
    const otherName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OID,
        false,
        forge.asn1.oidToDer(wrongOid).getBytes(),
      ),
      otherNameValue,
    ]);
    const san = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      otherName,
    ]);
    cert.setExtensions([
      {
        id: "2.5.29.17",
        name: "subjectAltName",
        value: forge.asn1.toDer(san).getBytes(),
      } as unknown as forge.pki.CertificateExtension,
    ]);
    cert.sign(keys.privateKey);
    expect(extractCnpjFromCert(cert)).toBeNull();
  });
});
