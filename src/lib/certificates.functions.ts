import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import forge from "node-forge";

type ParseInput = {
  companyId: string;
  fileName: string;
  fileBase64: string;
  password: string;
};

// OID ICP-Brasil para e-CNPJ no otherName do SubjectAltName
const OID_ICPBR_CNPJ = "2.16.76.1.3.3";

function walkAsn1ForIcpCnpj(node: forge.asn1.Asn1 | undefined): string | null {
  if (!node) return null;
  try {
    const anyNode = node as unknown as {
      type: number;
      tagClass: number;
      constructed: boolean;
      value: forge.asn1.Asn1[] | string;
    };
    if (Array.isArray(anyNode.value)) {
      // otherName é [0] IMPLICIT SEQUENCE { OID, [0] EXPLICIT value }
      if (anyNode.tagClass === 0x80 && anyNode.type === 0 && anyNode.constructed) {
        const children = anyNode.value;
        const oidNode = children.find(
          (c) => (c as unknown as { type: number }).type === forge.asn1.Type.OID,
        );
        if (oidNode) {
          const oidVal = forge.asn1.derToOid((oidNode as unknown as { value: string }).value);
          if (oidVal === OID_ICPBR_CNPJ) {
            const collectDigits = (n: forge.asn1.Asn1): string | null => {
              const nn = n as unknown as { value: forge.asn1.Asn1[] | string };
              if (typeof nn.value === "string") {
                const m = nn.value.replace(/\D/g, "").match(/\d{14}/);
                if (m) return m[0];
              } else if (Array.isArray(nn.value)) {
                for (const c of nn.value) {
                  const r = collectDigits(c);
                  if (r) return r;
                }
              }
              return null;
            };
            for (const child of children) {
              if (child === oidNode) continue;
              const r = collectDigits(child);
              if (r) return r;
            }
          }
        }
      }
      for (const child of anyNode.value) {
        const r = walkAsn1ForIcpCnpj(child);
        if (r) return r;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function isValidCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(cnpj.slice(0, 12), w1);
  const d2 = calc(cnpj.slice(0, 12) + String(d1), w2);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

function extractCnpjFromCert(cert: forge.pki.Certificate): string | null {
  // 1) subjectAltName: otherName ICP-Brasil (OID 2.16.76.1.3.3) — fonte canônica
  try {
    const sanExt = (
      cert.extensions as Array<{ id?: string; name?: string; value?: string }> | undefined
    )?.find((e) => e.id === "2.5.29.17" || e.name === "subjectAltName");
    if (sanExt?.value) {
      const asn1 = forge.asn1.fromDer(sanExt.value);
      const found = walkAsn1ForIcpCnpj(asn1);
      if (found && isValidCnpj(found)) return found;
    }
  } catch {
    // ignore
  }

  // 2) Fallback controlado: CN "NOME:CNPJ" — aceita apenas se for CNPJ válido
  const cn = cert.subject.attributes.find((a) => a.shortName === "CN")?.value as string | undefined;
  if (cn) {
    const digits = cn.replace(/\D/g, "");
    for (let i = 0; i + 14 <= digits.length; i++) {
      const candidate = digits.slice(i, i + 14);
      if (isValidCnpj(candidate)) return candidate;
    }
  }

  return null;
}


function parsePfx(base64: string, password: string) {
  const der = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(der);
  // Throws if password is wrong
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bags = certBags[forge.pki.oids.certBag] ?? [];
  if (bags.length === 0) throw new Error("Nenhum certificado encontrado no arquivo.");

  // Pick the certificate with the latest notAfter (usually the leaf)
  let leaf = bags[0].cert!;
  for (const b of bags) {
    if (b.cert && b.cert.validity.notAfter > leaf.validity.notAfter) leaf = b.cert;
  }

  const subject = leaf.subject.attributes
    .map((a) => `${a.shortName || a.name}=${a.value}`)
    .join(", ");
  const issuer = leaf.issuer.attributes
    .map((a) => `${a.shortName || a.name}=${a.value}`)
    .join(", ");

  const cnpj = extractCnpjFromCert(leaf);

  return {
    subject,
    issuer,
    notBefore: leaf.validity.notBefore.toISOString(),
    notAfter: leaf.validity.notAfter.toISOString(),
    serialNumber: leaf.serialNumber,
    cnpj,
  };
}

export const installCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ParseInput) => {
    if (!input?.companyId) throw new Error("Empresa é obrigatória.");
    if (!input?.fileBase64) throw new Error("Arquivo é obrigatório.");
    if (typeof input.password !== "string") throw new Error("Senha inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    let parsed;
    try {
      parsed = parsePfx(data.fileBase64, data.password);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (
        msg.includes("mac") ||
        msg.includes("password") ||
        msg.includes("invalid") ||
        msg.includes("decrypt")
      ) {
        throw new Error("Senha do certificado incorreta.");
      }
      throw new Error("Arquivo de certificado inválido ou corrompido.");
    }

    const { supabase } = context;

    // Verify user has access to the company
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, organization_id, cnpj, razao_social")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyErr || !company) throw new Error("Empresa não encontrada ou sem acesso.");

    // Verifica se o CNPJ do certificado corresponde ao da empresa selecionada
    const companyCnpj = String((company as { cnpj?: string }).cnpj ?? "").replace(/\D/g, "");
    if (!parsed.cnpj) {
      throw new Error(
        "Não foi possível identificar o CNPJ no certificado. Verifique se é um e-CNPJ ICP-Brasil (A1)."
      );
    }
    if (companyCnpj && parsed.cnpj !== companyCnpj) {
      const fmt = (c: string) =>
        c.length === 14
          ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
          : c;
      throw new Error(
        `O certificado pertence ao CNPJ ${fmt(parsed.cnpj)} e não corresponde ao CNPJ da empresa selecionada (${fmt(companyCnpj)}).`
      );
    }

    const now = Date.now();
    const notAfterMs = new Date(parsed.notAfter).getTime();
    const status = notAfterMs < now ? "expired" : "active";

    const { error } = await supabase.from("digital_certificates").insert({
      company_id: data.companyId,
      type: "A1",
      file_path: data.fileName,
      expires_at: parsed.notAfter,
      status,
    } as never);
    if (error) throw new Error(error.message);

    return {
      ok: true,
      expiresAt: parsed.notAfter,
      subject: parsed.subject,
      issuer: parsed.issuer,
    };
  });
