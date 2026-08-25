import { describe, expect, it } from "vitest";
import {
  isFullNfeDocument,
  nfeAccessKey,
  nfeDistributionMetadata,
  nfeDistributedKind,
  wouldDowngradeCompleteDocument,
} from "./fiscal-document-reconciliation";

const key = "35123456789012345678901234567890123456789012";

describe("NF-e reconciliation helpers", () => {
  it("extracts the access key from summaries and processed NF-e XML", () => {
    expect(nfeAccessKey(`<resNFe><chNFe>${key}</chNFe></resNFe>`)).toBe(key);
    expect(nfeAccessKey(`<NFe><infNFe Id="NFe${key}" /></NFe>`)).toBe(key);
  });

  it("does not classify a resNFe summary as full XML", () => {
    expect(
      isFullNfeDocument({
        schema: "resNFe_v1.01.xsd",
        xml: `<resNFe><chNFe>${key}</chNFe></resNFe>`,
      }),
    ).toBe(false);
  });

  it("separates distribution events from summaries and full XML", () => {
    expect(
      nfeDistributedKind({
        schema: "procEventoNFe_v1.00.xsd",
        xml: `<procEventoNFe><evento><infEvento><chNFe>${key}</chNFe><tpEvento>210210</tpEvento></infEvento></evento></procEventoNFe>`,
      }),
    ).toBe("event");
    expect(
      nfeDistributedKind({ schema: "resNFe_v1.01.xsd", xml: `<resNFe><chNFe>${key}</chNFe></resNFe>` }),
    ).toBe("summary");
  });

  it("prevents a repeated resNFe from downgrading an existing complete NF-e", () => {
    expect(
      wouldDowngradeCompleteDocument({
        incomingKind: "summary",
        currentFullXmlPath: "company/complete.xml",
      }),
    ).toBe(true);
    expect(
      wouldDowngradeCompleteDocument({ incomingKind: "full", currentFullXmlPath: "old.xml" }),
    ).toBe(false);
  });

  it("recognizes complete XML by schema or document content", () => {
    expect(isFullNfeDocument({ schema: "procNFe_v4.00.xsd", xml: "<xml />" })).toBe(true);
    expect(
      isFullNfeDocument({
        schema: "unknown",
        xml: `<nfeProc><NFe><infNFe Id="NFe${key}" /></NFe></nfeProc>`,
      }),
    ).toBe(true);
  });

  it("extracts decision data from resNFe without inventing unavailable fields", () => {
    const metadata = nfeDistributionMetadata({
      schema: "resNFe_v1.01.xsd",
      xml: `<resNFe><chNFe>${key}</chNFe><CNPJ>12345678000190</CNPJ><xNome>Fornecedor SA</xNome><IE>1234</IE><dhEmi>2026-08-24T10:00:00-03:00</dhEmi><tpNF>1</tpNF><vNF>1599.90</vNF><dhRecbto>2026-08-24T10:03:00-03:00</dhRecbto><nProt>135260000000001</nProt><cSitNFe>1</cSitNFe></resNFe>`,
    });
    expect(metadata).toMatchObject({
      key,
      documentType: "Resumo NF-e",
      issuerTaxId: "12345678000190",
      issuerName: "Fornecedor SA",
      total: 1599.9,
      situation: "1",
      full: false,
    });
  });
});
