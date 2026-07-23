import forge from "node-forge";

// OID ICP-Brasil para e-CNPJ no otherName do SubjectAltName
export const OID_ICPBR_CNPJ = "2.16.76.1.3.3";

export function isValidCnpj(cnpj: string): boolean {
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

export function walkAsn1ForIcpCnpj(node: forge.asn1.Asn1 | undefined): string | null {
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
                // ICP-Brasil: os primeiros 8 bytes são a data de nascimento (AAAAMMDD),
                // seguidos pelos 14 dígitos do CNPJ. Não podemos aceitar qualquer
                // sequência de 14 dígitos — precisamos validar como CNPJ.
                const digits = nn.value.replace(/\D/g, "");
                for (let i = 0; i + 14 <= digits.length; i++) {
                  const cand = digits.slice(i, i + 14);
                  if (isValidCnpj(cand)) return cand;
                }
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

export function extractCnpjFromCert(cert: forge.pki.Certificate): string | null {
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
