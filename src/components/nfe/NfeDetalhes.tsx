import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, FileText, Mail, XCircle, Clock, ChevronRight } from "lucide-react";
import { useState } from "react";
import { NfeItemDrawer } from "./NfeItemDrawer";

// Mock data
const mockNFe = {
  ide: {
    numero: "000123",
    serie: "1",
    modelo: "55",
    natOp: "VENDA DE MERCADORIA",
    tpNF: "1 - Saída",
    finNFe: "1 - Normal",
    dataEmissao: "2026-07-20T10:00:00",
    dataEntSaida: "2026-07-20T10:00:00",
    protocolo: "135260000123456",
    dataAutorizacao: "2026-07-20T10:05:00",
    status: "Autorizada",
    chave: "35260712345678000100550010000001231234567890"
  },
  emit: {
    razao: "APFISCAL TECNOLOGIA LTDA",
    fantasia: "APFISCAL",
    cnpj: "12.345.678/0001-00",
    ie: "123.456.789.111",
    im: "987654",
    endereco: "Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100",
    fone: "(11) 3333-4444",
    email: "contato@apfiscal.com.br",
    regime: "3 - Regime Normal"
  },
  dest: {
    razao: "SOLUCOES EMPRESARIAIS S.A.",
    fantasia: "SOLUCOES S.A.",
    cnpj: "98.765.432/0001-99",
    ie: "987.654.321.000",
    endereco: "Rua do Comercio, 500 - Centro, Rio de Janeiro - RJ, 20000-000",
    fone: "(21) 2222-3333",
    email: "financeiro@solucoes.com.br",
    indIEDest: "1 - Contribuinte ICMS",
    indFinal: "0 - Não"
  },
  total: {
    vProd: 1250.00,
    vDesc: 50.00,
    vFrete: 100.00,
    vSeg: 0.00,
    vOutro: 0.00,
    vNF: 1300.00,
    vTotTrib: 345.50,
    vICMS: 225.00,
    vBC: 1250.00,
    vICMSST: 0.00,
    vBCST: 0.00,
    vIPI: 62.50,
    vPIS: 20.31,
    vCOFINS: 93.75,
    vII: 0.00
  },
  items: [
    { 
      id: "1", 
      cod: "PROD-001", 
      desc: "SERVIDOR DELL POWEREDGE R750", 
      ncm: "84715010", 
      cfop: "5102", 
      unidade: "UN", 
      qtd: 1, 
      valorUnit: 1250.00, 
      total: 1250.00,
      desconto: 50.00,
      impostos: {
        icms: { cst: "00", origem: "0", modalidadeBc: "3", valorBc: 1200.00, aliquota: 18, valor: 216.00 },
        pis: { cst: "01", valorBc: 1200.00, aliquota: 1.65, valor: 19.80 },
        cofins: { cst: "01", valorBc: 1200.00, aliquota: 7.6, valor: 91.20 },
        ipi: { cst: "50", valorBc: 1200.00, aliquota: 5, valor: 60.00 }
      },
      infAdProd: "Garantia estendida de 3 anos inclusa."
    }
  ],
  transp: {
    modFrete: "0 - Por conta do Emitente",
    transportadora: {
      razao: "LOGISTICA RAPIDA LTDA",
      cnpj: "11.222.333/0001-44",
      ie: "444.555.666.777",
      endereco: "Rodovia Anhanguera, KM 15 - Jundiaí/SP"
    },
    veiculo: { placa: "ABC-1234", uf: "SP", rntc: "12345678" },
    volumes: { qtd: 1, especie: "CAIXA", marca: "DELL", pesoL: 25.500, pesoB: 28.000 }
  },
  cobr: {
    fat: { nFat: "123", vOrig: 1300.00, vDesc: 0.00, vLiq: 1300.00 },
    dupl: [
      { nDup: "001", dVenc: "2026-08-20", vDup: 650.00 },
      { nDup: "002", dVenc: "2026-09-20", vDup: 650.00 }
    ]
  },
  infAdic: {
    infCpl: "VALOR APROXIMADO DOS TRIBUTOS R$ 345,50 (26,58%) FONTE: IBPT. PAGAMENTO VIA BOLETO BANCARIO.",
    infAdFisco: "MERCADORIA DESTINADA A REVENDA."
  },
  eventos: [
    { tipo: "Emissão", data: "2026-07-20 10:00:00", desc: "NF-e emitida pelo contribuinte" },
    { tipo: "Autorização", data: "2026-07-20 10:05:00", desc: "NF-e autorizada pelo SEFAZ (Protocolo: 135260000123456)" }
  ],
  xml: "<?xml version=\"1.0\" encoding=\"UTF-8\"?><nfeProc xmlns=\"http://www.portalfiscal.inf.br/nfe\" versao=\"4.00\"><NFe><infNFe Id=\"NFe35260712345678000100550010000001231234567890\" versao=\"4.00\"><ide>...</ide><emit>...</emit><dest>...</dest><det>...</det><total>...</total><transp>...</transp></infNFe></NFe></nfeProc>"
};

export const NfeDetalhes = ({ nfeId }: { nfeId: string }) => {
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  return (
    <div className="flex flex-col h-full space-y-4 p-6">
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 p-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => window.history.back()}>Voltar</Button>
          <div>
            <h1 className="text-xl font-bold">NF-e nº {mockNFe.ide.numero} — Série {mockNFe.ide.serie} — Modelo {mockNFe.ide.modelo}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">Autorizada</Badge>
              <span className="font-mono">{mockNFe.ide.chave}</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                onClick={() => {
                  navigator.clipboard.writeText(mockNFe.ide.chave);
                  // toast? sonner is available
                }}
              >
                <Copy className="h-3.5 w-3.5"/>
              </Button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4"/> XML</Button>
          <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4"/> DANFE (PDF)</Button>
          <Button variant="outline" size="sm"><Mail className="mr-2 h-4 w-4"/> Reenviar</Button>
          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10"><XCircle className="mr-2 h-4 w-4"/> Cancelar</Button>
        </div>
      </div>

      <Tabs defaultValue="resumo" className="flex-1">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="items">Itens</TabsTrigger>
          <TabsTrigger value="impostos">Impostos</TabsTrigger>
          <TabsTrigger value="transporte">Transporte</TabsTrigger>
        </TabsList>
        <TabsContent value="resumo" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Dados Gerais</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-muted-foreground">Natureza</p><p>{mockNFe.ide.natOp}</p></div>
              <div><p className="text-sm text-muted-foreground">Emissão</p><p>{new Date(mockNFe.ide.dataEmissao).toLocaleDateString()}</p></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="items">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-4 text-left">Código</th>
                    <th className="p-4 text-left">Descrição</th>
                    <th className="p-4 text-right">Qtd</th>
                    <th className="p-4 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {mockNFe.items.map(item => (
                    <tr key={item.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedItem(item)}>
                      <td className="p-4">{item.cod}</td>
                      <td className="p-4">{item.desc}</td>
                      <td className="p-4 text-right">{item.qtd}</td>
                      <td className="p-4 text-right">R$ {item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <NfeItemDrawer item={selectedItem} open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)} />
    </div>
  );
};
