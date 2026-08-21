import { describe, expect, it } from "vitest";
import { isFullNfeDocument, nfeAccessKey } from "./fiscal-document-reconciliation";

const key = "35123456789012345678901234567890123456789012";

describe("NF-e reconciliation helpers", () => {
  it("extracts the access key from summaries and processed NF-e XML", () => {
    expect(nfeAccessKey(`<resNFe><chNFe>${key}</chNFe></resNFe>`)).toBe(key);
    expect(nfeAccessKey(`<NFe><infNFe Id="NFe${key}" /></NFe>`)).toBe(key);
  });

  it("does not classify a resNFe summary as full XML", () => {
    expect(isFullNfeDocument({ schema: "resNFe_v1.01.xsd", xml: `<resNFe><chNFe>${key}</chNFe></resNFe>` })).toBe(false);
  });

  it("recognizes complete XML by schema or document content", () => {
    expect(isFullNfeDocument({ schema: "procNFe_v4.00.xsd", xml: "<xml />" })).toBe(true);
    expect(isFullNfeDocument({ schema: "unknown", xml: `<nfeProc><NFe><infNFe Id="NFe${key}" /></NFe></nfeProc>` })).toBe(true);
  });
});
