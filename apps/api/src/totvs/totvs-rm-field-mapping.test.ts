import { describe, expect, it } from "vitest";
import {
  discountPercentage,
  icmsOrigin,
  merchandiseSituation,
  nfseIssuerState,
  nfseNatureCode,
  nfseRmTaxes,
} from "./totvs-rm-field-mapping";
import { rmTaxValues } from "./totvs-rm-writer.service";

describe("TOTVS RM field mappings", () => {
  it("maps APFiscal purchase types to RM merchandise situations", () => {
    expect(merchandiseSituation("07")).toBe("11");
    expect(merchandiseSituation("08")).toBe("12");
    expect(merchandiseSituation("09")).toBe("13");
    expect(merchandiseSituation("99")).toBe("14");
  });

  it("calculates the discount percentage using the stored gross basis", () => {
    expect(discountPercentage(0.7, 157)).toBe(0.4459);
    expect(discountPercentage(0, 157)).toBe(0);
  });

  it("reads the ICMS orig tag regardless of the ICMS group", () => {
    expect(icmsOrigin({ ICMS: { ICMS00: { orig: "0", CST: "00" } } })).toBe(0);
    expect(icmsOrigin({ ICMS: { ICMSSN102: { orig: 2 } } })).toBe(2);
    expect(icmsOrigin({ ISS: { vISSQN: 10 } })).toBeNull();
  });

  it("maps the NFSe nature from the company and supplier states", () => {
    expect(nfseNatureCode("SP", "sp")).toBe("1.933.001");
    expect(nfseNatureCode("SP", "MG")).toBe("2.933.001");
    expect(nfseNatureCode("SP", null)).toBeNull();
  });

  it("reads the NFSe issuer state from the canonical persisted details", () => {
    expect(nfseIssuerState(null, { issuer: { address: { state: "SP" } } }, null)).toBe("SP");
    expect(nfseIssuerState(null, null, { enderNac: { UF: "MG" } })).toBe("MG");
    expect(nfseIssuerState("pr", { issuer: { address: { state: "SP" } } }, null)).toBe("PR");
  });

  it("maps all parsed NFSe taxes to the RM tax groups", () => {
    const taxes = nfseRmTaxes(
      {
        taxes: {
          iss: 74.92,
          issBase: 1498.5,
          issRate: 5,
          pisValue: 24.73,
          pisBase: 1498.5,
          pisRate: 1.65,
          pisCst: "01",
          cofinsValue: 113.89,
          cofinsBase: 1498.5,
          cofinsRate: 7.6,
          cofinsCst: "01",
        },
      },
      { base: null, rate: null, value: null },
    );
    expect(rmTaxValues(taxes, "ISS")).toEqual({
      base: 1498.5,
      rate: 5,
      value: 74.92,
      cst: null,
      enq: null,
    });
    expect(rmTaxValues(taxes, "PIS")).toMatchObject({
      base: 1498.5,
      rate: 1.65,
      value: 24.73,
      cst: "01",
    });
    expect(rmTaxValues(taxes, "COFINS")).toMatchObject({
      base: 1498.5,
      rate: 7.6,
      value: 113.89,
      cst: "01",
    });
  });

  it("continues reading ICMS, PIS, COFINS and IPI from an NF-e item", () => {
    const nfeTaxes = {
      ICMS: { ICMS00: { orig: "0", CST: "00", vBC: "100", pICMS: "18", vICMS: "18" } },
      PIS: { PISAliq: { CST: "01", vBC: "100", pPIS: "1.65", vPIS: "1.65" } },
      COFINS: { COFINSAliq: { CST: "01", vBC: "100", pCOFINS: "7.6", vCOFINS: "7.6" } },
      IPI: { IPITrib: { CST: "50", vBC: "100", pIPI: "5", vIPI: "5", cEnq: "999" } },
    };
    expect(rmTaxValues(nfeTaxes, "ICMS")).toMatchObject({ value: 18, rate: 18, base: 100 });
    expect(rmTaxValues(nfeTaxes, "PIS")).toMatchObject({ value: 1.65, rate: 1.65, base: 100 });
    expect(rmTaxValues(nfeTaxes, "COFINS")).toMatchObject({ value: 7.6, rate: 7.6, base: 100 });
    expect(rmTaxValues(nfeTaxes, "IPI")).toMatchObject({ value: 5, rate: 5, base: 100 });
  });
});
