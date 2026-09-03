import { describe, expect, it } from "vitest";
import {
  discountPercentage,
  icmsOrigin,
  merchandiseSituation,
  nfseNatureCode,
} from "./totvs-rm-field-mapping";

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
});
