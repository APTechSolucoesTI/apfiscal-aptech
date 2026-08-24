import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseAdnBatch } from "./nfse-adn-parser";
import { parseNfseXml } from "./nfse-document-parser";

const xml = `<?xml version="1.0"?><NFSe><infNFSe Id="NFS${"1".repeat(50)}"><nNFSe>2575</nNFSe><dhProc>2026-01-16T09:38:08-03:00</dhProc><emit><CNPJ>11222333000144</CNPJ><xNome>Prestador</xNome></emit><valores><vISSQN>45.00</vISSQN><vLiq>900.00</vLiq></valores><DPS><infDPS><serie>90000</serie><toma><CNPJ>08168210000286</CNPJ><xNome>Tomador</xNome></toma><serv><locPrest><cLocPrestacao>3501608</cLocPrestacao></locPrest></serv></infDPS></DPS></infNFSe></NFSe>`;

describe("ADN NFS-e", () => {
  it("expande o lote, descompacta o XML e usa o maior NSU", () => {
    const body = Buffer.from(
      JSON.stringify({
        StatusProcessamento: "DOCUMENTOS_LOCALIZADOS",
        LoteDFe: [
          {
            NSU: 24,
            ChaveAcesso: "1".repeat(50),
            TipoDocumento: "NFSE",
            ArquivoXml: gzipSync(xml).toString("base64"),
          },
          { NSU: 25, TipoDocumento: "EVENTO", ArquivoXml: "ignorado" },
        ],
      }),
    );
    const result = parseAdnBatch(body, 10);
    expect(result).toMatchObject({
      status: "DOCUMENTOS_LOCALIZADOS",
      located: 2,
      lastNsu: 25,
    });
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].rawDocument).toContain("<NFSe>");
  });

  it("extrai os campos canônicos e o CNPJ do tomador", () => {
    expect(parseNfseXml(xml, "1".repeat(50))).toMatchObject({
      number: "2575",
      issuerTaxId: "11222333000144",
      recipientTaxId: "08168210000286",
      total: 900,
      taxTotal: 45,
    });
  });
});
