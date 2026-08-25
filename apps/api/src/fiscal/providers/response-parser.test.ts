import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseDistributionResponse, parseEventResponse } from "./response-parser";

describe("parseDistributionResponse", () => {
  it("normaliza checkpoint e descompacta docZip retornado pela SEFAZ", () => {
    const xml = "<resNFe><chNFe>35123456789012345678901234567890123456789012</chNFe></resNFe>";
    const response = {
      retDistDFeInt: {
        cStat: "138",
        xMotivo: "Documento localizado",
        ultNSU: "000000000000123",
        maxNSU: "000000000000124",
        loteDistDFeInt: { docZip: { "@_NSU": "000000000000123", "@_schema": "resNFe_v1.01.xsd", "#text": deflateSync(xml).toString("base64") } },
      },
    };
    expect(parseDistributionResponse(response, "0")).toEqual({
      cStat: "138",
      xMotivo: "Documento localizado",
      lastNsu: "000000000000123",
      maxNsu: "000000000000124",
      documents: [{ nsu: "000000000000123", schema: "resNFe_v1.01.xsd", xml }],
    });
  });

  it("mantém o checkpoint atual quando a resposta não traz ultNSU", () => {
    expect(parseDistributionResponse({ cStat: 137, xMotivo: "Sem documentos" }, "42").lastNsu).toBe("42");
  });
});

describe("parseEventResponse", () => {
  it("usa o resultado interno do evento, não o status 128 do lote", () => {
    const result = parseEventResponse({
      retEnvEvento: {
        cStat: "128",
        xMotivo: "Lote processado",
        retEvento: {
          infEvento: {
            tpEvento: "210210",
            cStat: "135",
            xMotivo: "Evento registrado",
            nProt: "135260000000001",
            dhRegEvento: "2026-08-25T10:00:00-03:00",
          },
        },
      },
    });
    expect(result).toMatchObject({
      cStat: "135",
      xMotivo: "Evento registrado",
      protocol: "135260000000001",
      eventAt: "2026-08-25T10:00:00-03:00",
    });
  });
});
