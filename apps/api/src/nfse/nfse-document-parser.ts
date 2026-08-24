import { XMLParser } from "fast-xml-parser";

type XmlObject = Record<string, unknown>;

export type CanonicalNfse = {
  accessKey: string;
  number: string;
  series: string | null;
  issuedAt: string | null;
  issuerTaxId: string | null;
  issuerName: string | null;
  recipientTaxId: string | null;
  recipientName: string | null;
  total: number | null;
  taxTotal: number | null;
  status: string | null;
  serviceDescription: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

function object(value: unknown): XmlObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as XmlObject) : {};
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function taxId(entity: XmlObject): string | null {
  return text(entity.CNPJ ?? entity.CPF)?.replace(/\D/g, "") ?? null;
}

function decimal(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNfseXml(xml: string, suppliedAccessKey?: string | null): CanonicalNfse {
  const parsed = object(parser.parse(xml));
  const root = object(parsed.NFSe);
  const info = object(root.infNFSe);
  if (!Object.keys(info).length) throw new Error("O XML não contém o grupo obrigatório infNFSe.");
  const dps = object(object(info.DPS).infDPS);
  const issuer = object(info.emit ?? dps.prest);
  const recipient = object(dps.toma);
  const values = object(info.valores);
  const accessKey =
    suppliedAccessKey?.match(/^\d{50}$/)?.[0] ??
    text(info["@_Id"])?.match(/\d{50}/)?.[0] ??
    xml.match(/\b\d{50}\b/)?.[0];
  if (!accessKey) throw new Error("A NFS-e não possui uma chave de acesso válida.");
  const number = text(info.nNFSe);
  if (!number) throw new Error("A NFS-e não possui número.");
  return {
    accessKey,
    number,
    series: text(dps.serie),
    issuedAt: text(info.dhProc ?? dps.dhEmi),
    issuerTaxId: taxId(issuer),
    issuerName: text(issuer.xNome ?? issuer.xFant),
    recipientTaxId: taxId(recipient),
    recipientName: text(recipient.xNome),
    total: decimal(values.vLiq ?? values.vServPrest ?? values.vTotalRet),
    taxTotal: decimal(values.vISSQN),
    status: text(info.cStat),
    serviceDescription: text(info.xTribMun ?? info.xTribNac),
  };
}
