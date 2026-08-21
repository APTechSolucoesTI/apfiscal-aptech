import type { DistributionResult } from "@apfiscal/shared";

type DistributedDocument = DistributionResult["documents"][number];

export function nfeAccessKey(xml: string): string | null {
  return xml.match(/<chNFe>\s*(\d{44})\s*<\/chNFe>/i)?.[1]
    ?? xml.match(/\bNFe(\d{44})\b/i)?.[1]
    ?? null;
}

export function isFullNfeDocument(document: Pick<DistributedDocument, "schema" | "xml">): boolean {
  return /(?:^|_)(?:procNFe|nfeProc)|<\s*(?:\w+:)?nfeProc\b|<\s*(?:\w+:)?NFe\b/i.test(`${document.schema}\n${document.xml}`);
}
