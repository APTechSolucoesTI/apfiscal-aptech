import type { DistributionResult } from "@apfiscal/shared";

type DistributedDocument = DistributionResult["documents"][number];

export function nfeAccessKey(xml: string): string | null {
  return (
    xml.match(/<chNFe>\s*(\d{44})\s*<\/chNFe>/i)?.[1] ?? xml.match(/\bNFe(\d{44})\b/i)?.[1] ?? null
  );
}

export function isFullNfeDocument(document: Pick<DistributedDocument, "schema" | "xml">): boolean {
  return /(?:^|_)(?:procNFe|nfeProc)|<\s*(?:\w+:)?nfeProc\b|<\s*(?:\w+:)?NFe\b/i.test(
    `${document.schema}\n${document.xml}`,
  );
}

function xmlText(xml: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    xml
      .match(
        new RegExp(
          `<\\s*(?:\\w+:)?${escaped}\\b[^>]*>\\s*([^<]*?)\\s*<\\/\\s*(?:\\w+:)?${escaped}\\s*>`,
          "i",
        ),
      )?.[1]
      ?.trim() || null
  );
}

function numberFromKey(key: string): string | null {
  const value = key.slice(25, 34).replace(/^0+/, "");
  return value || null;
}

export function nfeDistributionMetadata(document: Pick<DistributedDocument, "schema" | "xml">) {
  const key = nfeAccessKey(document.xml);
  const taxId = xmlText(document.xml, "CNPJ") ?? xmlText(document.xml, "CPF");
  const full = isFullNfeDocument(document);
  return {
    key,
    documentType: /resEvento|procEvento|evento/i.test(`${document.schema}\n${document.xml}`)
      ? "Evento"
      : full
        ? "NF-e completa"
        : "Resumo NF-e",
    schema: document.schema || "unknown",
    number: xmlText(document.xml, "nNF") ?? (key ? numberFromKey(key) : null),
    series: xmlText(document.xml, "serie") ?? (key ? String(Number(key.slice(22, 25))) : null),
    issuerTaxId: taxId,
    issuerName: xmlText(document.xml, "xNome"),
    issuerStateRegistration: xmlText(document.xml, "IE"),
    issuedAt: xmlText(document.xml, "dhEmi") ?? xmlText(document.xml, "dEmi"),
    total: Number(xmlText(document.xml, "vNF")) || null,
    protocol: xmlText(document.xml, "nProt"),
    situation: xmlText(document.xml, "cSitNFe") ?? xmlText(document.xml, "cStat"),
    eventType: xmlText(document.xml, "tpEvento"),
    receivedAt: xmlText(document.xml, "dhRecbto"),
    full,
  };
}
