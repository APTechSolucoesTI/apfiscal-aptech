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

  it("extrai competencia, servico, municipio, regime e tributos da NFS-e nacional", () => {
    const detailed = `<?xml version="1.0"?><NFSe><infNFSe Id="NFS${"2".repeat(50)}"><xLocPrestacao>Conchas</xLocPrestacao><cLocIncid>3512308</cLocIncid><xLocIncid>Conchas</xLocIncid><nNFSe>7</nNFSe><cStat>100</cStat><dhProc>2026-07-17T13:55:07-03:00</dhProc><emit><CNPJ>10287986000186</CNPJ><IM>2479</IM><xNome>Prestador</xNome><enderNac><xLgr>Rua A</xLgr><nro>10</nro><cMun>3512308</cMun><UF>SP</UF></enderNac></emit><valores><vBC>1400.00</vBC><pAliqAplic>2.01</pAliqAplic><vISSQN>28.14</vISSQN><vLiq>1371.86</vLiq></valores><DPS><infDPS><serie>49999</serie><nDPS>7</nDPS><dCompet>2026-07-17</dCompet><prest><CNPJ>10287986000186</CNPJ><regTrib><opSimpNac>3</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest><toma><CNPJ>08168210000286</CNPJ><xNome>Tomador</xNome></toma><serv><locPrest><cLocPrestacao>3512308</cLocPrestacao></locPrest><cServ><cTribNac>140101</cTribNac><cIntContrib>9521500</cIntContrib><xDescServ>Manutencao de bomba</xDescServ></cServ></serv><valores><vServPrest><vServ>1400.00</vServ></vServPrest><trib><tribMun><tpRetISSQN>1</tpRetISSQN><pAliq>2.01</pAliq></tribMun></trib></valores></infDPS></DPS></infNFSe></NFSe>`;
    expect(parseNfseXml(detailed, "2".repeat(50))).toMatchObject({
      competenceDate: "2026-07-17",
      serviceMunicipalityCode: "3512308",
      serviceMunicipalityName: "Conchas",
      grossValue: 1400,
      netValue: 1371.86,
      issRate: 2.01,
      issValue: 28.14,
      serviceCodeNational: "140101",
      serviceCodeMunicipal: "9521500",
      taxRegime: "3",
      specialTaxRegime: "0",
      serviceDescription: "Manutencao de bomba",
    });
  });

  it("extrai PIS e COFINS devidos do grupo piscofins da DPS", () => {
    const taxed = `<?xml version="1.0"?><NFSe><infNFSe Id="NFS${"3".repeat(50)}"><nNFSe>7164</nNFSe><cStat>100</cStat><emit><CNPJ>21103412000127</CNPJ><xNome>Prestador</xNome></emit><valores><vBC>1498.50</vBC><pAliqAplic>5.00</pAliqAplic><vISSQN>74.92</vISSQN><vLiq>1498.50</vLiq></valores><DPS><infDPS><serie>00100</serie><toma><CNPJ>08168210000286</CNPJ></toma><serv><cServ><xDescServ>Servico tributado</xDescServ></cServ></serv><valores><vServPrest><vServ>1498.50</vServ></vServPrest><trib><tribMun><tpRetISSQN>1</tpRetISSQN></tribMun><tribFed><piscofins><CST>01</CST><vBCPisCofins>1498.50</vBCPisCofins><pAliqPis>1.65</pAliqPis><pAliqCofins>7.60</pAliqCofins><vPis>24.73</vPis><vCofins>113.89</vCofins><tpRetPisCofins>0</tpRetPisCofins></piscofins></tribFed></trib></valores></infDPS></DPS></infNFSe></NFSe>`;
    expect(parseNfseXml(taxed, "3".repeat(50))).toMatchObject({
      taxTotal: 213.54,
      details: {
        taxes: {
          iss: 74.92,
          pis: 24.73,
          pisValue: 24.73,
          pisBase: 1498.5,
          pisRate: 1.65,
          pisCst: "01",
          pisWithholdingType: "0",
          cofins: 113.89,
          cofinsValue: 113.89,
          cofinsBase: 1498.5,
          cofinsRate: 7.6,
          cofinsCst: "01",
        },
      },
    });
  });

  it("não atribui a retenção social agregada exclusivamente à CSLL", () => {
    const retained = `<?xml version="1.0"?><NFSe><infNFSe Id="NFS${"4".repeat(50)}"><nNFSe>10</nNFSe><cStat>100</cStat><emit><CNPJ>21103412000127</CNPJ></emit><valores><vLiq>985.00</vLiq></valores><DPS><infDPS><toma><CNPJ>08168210000286</CNPJ></toma><valores><vServPrest><vServ>1000.00</vServ></vServPrest><trib><tribFed><piscofins><CST>01</CST><tpRetPisCofins>3</tpRetPisCofins></piscofins><vRetCSLL>15.00</vRetCSLL></tribFed></trib></valores></infDPS></DPS></infNFSe></NFSe>`;
    expect(parseNfseXml(retained, "4".repeat(50))).toMatchObject({
      retentionsValue: 15,
      details: {
        taxes: {
          socialContributionsRetained: 15,
          totalRetentions: 15,
        },
      },
    });
    expect(parseNfseXml(retained, "4".repeat(50)).details.taxes).not.toHaveProperty("csll");
  });
});
