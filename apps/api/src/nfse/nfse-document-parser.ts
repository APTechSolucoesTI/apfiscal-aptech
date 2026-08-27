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
  externalId: string | null;
  verificationCode: string | null;
  competenceDate: string | null;
  serviceMunicipalityCode: string | null;
  serviceMunicipalityName: string | null;
  incidenceMunicipalityCode: string | null;
  incidenceMunicipalityName: string | null;
  grossValue: number | null;
  netValue: number | null;
  deductionsValue: number | null;
  unconditionalDiscountValue: number | null;
  conditionalDiscountValue: number | null;
  retentionsValue: number | null;
  issBaseValue: number | null;
  issRate: number | null;
  issValue: number | null;
  serviceCodeNational: string | null;
  serviceCodeMunicipal: string | null;
  cnaeCode: string | null;
  taxRegime: string | null;
  specialTaxRegime: string | null;
  details: Record<string, unknown>;
};

const APPROVED_NFSE_STATUS = new Set(["100", "102", "103", "107"]);

export function isApprovedNfseStatus(status: string | null | undefined): boolean {
  return APPROVED_NFSE_STATUS.has(String(status ?? "").trim());
}

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

function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );
}

function address(entity: XmlObject): Record<string, unknown> {
  const addressRoot = object(entity.enderNac ?? entity.end);
  const national = object(addressRoot.endNac ?? addressRoot);
  return compact({
    street: text(addressRoot.xLgr ?? national.xLgr),
    number: text(addressRoot.nro ?? national.nro),
    complement: text(addressRoot.xCpl ?? national.xCpl),
    district: text(addressRoot.xBairro ?? national.xBairro),
    municipalityCode: text(national.cMun),
    municipalityName: text(addressRoot.xMun ?? national.xMun),
    state: text(addressRoot.UF ?? national.UF),
    zipCode: text(national.CEP),
    country: text(addressRoot.xPais ?? national.xPais),
  });
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
  const dpsValues = object(dps.valores);
  const serviceValues = object(dpsValues.vServPrest);
  const tax = object(dpsValues.trib);
  const municipalTax = object(tax.tribMun);
  const federalTax = object(tax.tribFed);
  const service = object(dps.serv);
  const serviceCode = object(service.cServ);
  const serviceLocation = object(service.locPrest);
  const taxRegime = object(object(dps.prest).regTrib);
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
    total: decimal(values.vLiq ?? serviceValues.vServ ?? values.vServPrest ?? values.vTotalRet),
    taxTotal: decimal(values.vISSQN),
    status: text(info.cStat),
    serviceDescription: text(serviceCode.xDescServ ?? info.xTribMun ?? info.xTribNac),
    externalId: text(info["@_Id"]),
    verificationCode: text(info.cVerif ?? info.codVerificacao),
    competenceDate: text(dps.dCompet),
    serviceMunicipalityCode: text(serviceLocation.cLocPrestacao ?? dps.cLocEmi),
    serviceMunicipalityName: text(info.xLocPrestacao ?? info.xLocEmi),
    incidenceMunicipalityCode: text(info.cLocIncid),
    incidenceMunicipalityName: text(info.xLocIncid),
    grossValue: decimal(serviceValues.vServ ?? values.vBC ?? values.vLiq),
    netValue: decimal(values.vLiq),
    deductionsValue: decimal(serviceValues.vDedRed ?? values.vDedRed),
    unconditionalDiscountValue: decimal(serviceValues.vDescIncond ?? values.vDescIncond),
    conditionalDiscountValue: decimal(serviceValues.vDescCond ?? values.vDescCond),
    retentionsValue: decimal(values.vTotalRet ?? federalTax.vRetCP ?? federalTax.vRetIRRF),
    issBaseValue: decimal(values.vBC),
    issRate: decimal(values.pAliqAplic ?? municipalTax.pAliq),
    issValue: decimal(values.vISSQN),
    serviceCodeNational: text(serviceCode.cTribNac),
    serviceCodeMunicipal: text(serviceCode.cTribMun ?? serviceCode.cIntContrib),
    cnaeCode: text(serviceCode.CNAE ?? serviceCode.cCNAE),
    taxRegime: text(taxRegime.opSimpNac ?? taxRegime.regApTribSN),
    specialTaxRegime: text(taxRegime.regEspTrib),
    details: {
      issuer: compact({
        taxId: taxId(issuer),
        municipalRegistration: text(issuer.IM),
        stateRegistration: text(issuer.IE),
        name: text(issuer.xNome),
        tradeName: text(issuer.xFant),
        phone: text(issuer.fone),
        email: text(issuer.email),
        address: address(issuer),
      }),
      recipient: compact({
        taxId: taxId(recipient),
        municipalRegistration: text(recipient.IM),
        stateRegistration: text(recipient.IE),
        name: text(recipient.xNome),
        phone: text(recipient.fone),
        email: text(recipient.email),
        address: address(recipient),
      }),
      service: compact({
        nationalCode: text(serviceCode.cTribNac),
        municipalCode: text(serviceCode.cTribMun ?? serviceCode.cIntContrib),
        cnae: text(serviceCode.CNAE ?? serviceCode.cCNAE),
        description: text(serviceCode.xDescServ ?? info.xTribMun ?? info.xTribNac),
        additionalInformation: text(object(service.infoCompl).xInfComp),
        municipalityCode: text(serviceLocation.cLocPrestacao ?? dps.cLocEmi),
        municipalityName: text(info.xLocPrestacao ?? info.xLocEmi),
        incidenceMunicipalityCode: text(info.cLocIncid),
        incidenceMunicipalityName: text(info.xLocIncid),
      }),
      taxes: compact({
        iss: decimal(values.vISSQN),
        issBase: decimal(values.vBC),
        issRate: decimal(values.pAliqAplic ?? municipalTax.pAliq),
        issWithholdingType: text(municipalTax.tpRetISSQN),
        inss: decimal(federalTax.vRetCP ?? values.vINSS),
        ir: decimal(federalTax.vRetIRRF ?? values.vIR),
        csll: decimal(federalTax.vRetCSLL ?? values.vCSLL),
        pis: decimal(federalTax.vRetPIS ?? values.vPIS),
        cofins: decimal(federalTax.vRetCofins ?? values.vCOFINS),
        totalRetentions: decimal(values.vTotalRet),
      }),
      source: compact({
        applicationVersion: text(info.verAplic ?? dps.verAplic),
        environment: text(info.ambGer ?? dps.tpAmb),
        emissionType: text(info.tpEmis ?? dps.tpEmit),
        dpsNumber: text(dps.nDPS),
        dpsSeries: text(dps.serie),
        processedAt: text(info.dhProc),
      }),
    },
  };
}
