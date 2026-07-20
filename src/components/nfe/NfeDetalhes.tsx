import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, FileText, Mail, XCircle, Clock, ChevronRight, Truck, CreditCard, Info, History, Code, User, Building2 } from "lucide-react";
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

      <Tabs defaultValue="resumo" className="flex-1 overflow-hidden flex flex-col">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-4">
          <TabsTrigger value="resumo" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4">Resumo</TabsTrigger>
          <TabsTrigger value="items" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4">Itens</TabsTrigger>
          <TabsTrigger value="impostos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4">Impostos</TabsTrigger>
          <TabsTrigger value="transporte" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4">Transporte</TabsTrigger>
          <TabsTrigger value="cobranca" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4">Cobrança</TabsTrigger>
          <TabsTrigger value="adicionais" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4">Adicionais</TabsTrigger>
          <TabsTrigger value="historico" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4">Histórico</TabsTrigger>
          <TabsTrigger value="xml" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4">XML</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <div className="space-y-6 pb-10">
            {/* Tab: Resumo */}
            <TabsContent value="resumo" className="m-0 space-y-6">
              {/* Totais Highlights */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Valor Total da Nota</p>
                    <p className="text-2xl font-bold text-primary">R$ {mockNFe.total.vNF.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Produtos</p>
                    <p className="text-2xl font-bold">R$ {mockNFe.total.vProd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Descontos</p>
                    <p className="text-2xl font-bold text-destructive">R$ {mockNFe.total.vDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Tributos (Aprox.)</p>
                    <p className="text-2xl font-bold text-amber-600">R$ {mockNFe.total.vTotTrib.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Identificação */}
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-4">
                    <Info className="h-4 w-4 text-primary" />
                    <CardTitle className="text-lg">Dados de Identificação</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-y-4 text-sm">
                    <div><p className="text-muted-foreground">Natureza da Operação</p><p className="font-medium">{mockNFe.ide.natOp}</p></div>
                    <div><p className="text-muted-foreground">Tipo de Operação</p><p className="font-medium">{mockNFe.ide.tpNF}</p></div>
                    <div><p className="text-muted-foreground">Finalidade</p><p className="font-medium">{mockNFe.ide.finNFe}</p></div>
                    <div><p className="text-muted-foreground">Protocolo</p><p className="font-medium">{mockNFe.ide.protocolo}</p></div>
                    <div><p className="text-muted-foreground">Data Emissão</p><p className="font-medium">{new Date(mockNFe.ide.dataEmissao).toLocaleString('pt-BR')}</p></div>
                    <div><p className="text-muted-foreground">Data Autorização</p><p className="font-medium">{new Date(mockNFe.ide.dataAutorizacao).toLocaleString('pt-BR')}</p></div>
                  </CardContent>
                </Card>

                {/* Emitente */}
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-4">
                    <Building2 className="h-4 w-4 text-primary" />
                    <CardTitle className="text-lg">Emitente</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between font-bold"><span>{mockNFe.emit.razao}</span> <span>{mockNFe.emit.cnpj}</span></div>
                    <p className="text-muted-foreground">{mockNFe.emit.endereco}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <p><span className="text-muted-foreground">IE:</span> {mockNFe.emit.ie}</p>
                      <p><span className="text-muted-foreground">IM:</span> {mockNFe.emit.im}</p>
                    </div>
                    <p className="text-xs bg-muted p-1 inline-block rounded">{mockNFe.emit.regime}</p>
                  </CardContent>
                </Card>

                {/* Destinatário */}
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-4">
                    <User className="h-4 w-4 text-primary" />
                    <CardTitle className="text-lg">Destinatário</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between font-bold"><span>{mockNFe.dest.razao}</span> <span>{mockNFe.dest.cnpj}</span></div>
                    <p className="text-muted-foreground">{mockNFe.dest.endereco}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <p><span className="text-muted-foreground">IE:</span> {mockNFe.dest.ie}</p>
                      <p><span className="text-muted-foreground">Fone:</span> {mockNFe.dest.fone}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Tab: Itens */}
            <TabsContent value="items" className="m-0">
              <Card>
                <CardContent className="p-0">
                  <div className="relative overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Código</th>
                          <th className="px-4 py-3">Descrição</th>
                          <th className="px-4 py-3">NCM</th>
                          <th className="px-4 py-3">CFOP</th>
                          <th className="px-4 py-3">UN</th>
                          <th className="px-4 py-3 text-right">Qtd</th>
                          <th className="px-4 py-3 text-right">Unitário</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {mockNFe.items.map((item) => (
                          <tr key={item.id} className="border-b hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setSelectedItem(item)}>
                            <td className="px-4 py-4 font-mono text-xs">{item.cod}</td>
                            <td className="px-4 py-4 font-medium">{item.desc}</td>
                            <td className="px-4 py-4">{item.ncm}</td>
                            <td className="px-4 py-4">{item.cfop}</td>
                            <td className="px-4 py-4">{item.unidade}</td>
                            <td className="px-4 py-4 text-right">{item.qtd}</td>
                            <td className="px-4 py-4 text-right">R$ {item.valorUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-4 text-right font-bold">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-4"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Impostos */}
            <TabsContent value="impostos" className="m-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm uppercase text-muted-foreground">ICMS</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-end">
                      <div><p className="text-xs text-muted-foreground">BC ICMS</p><p className="font-bold">R$ {mockNFe.total.vBC.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                      <div className="text-right"><p className="text-xs text-muted-foreground">Valor ICMS</p><p className="text-xl font-bold text-primary">R$ {mockNFe.total.vICMS.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm uppercase text-muted-foreground">IPI</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Valor IPI</p>
                    <p className="text-xl font-bold text-primary">R$ {mockNFe.total.vIPI.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm uppercase text-muted-foreground">PIS / COFINS</CardTitle></CardHeader>
                  <CardContent className="flex justify-between">
                    <div><p className="text-xs text-muted-foreground">PIS</p><p className="font-bold">R$ {mockNFe.total.vPIS.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                    <div className="text-right"><p className="text-xs text-muted-foreground">COFINS</p><p className="font-bold">R$ {mockNFe.total.vCOFINS.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Tab: Transporte */}
            <TabsContent value="transporte" className="m-0 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  <CardTitle>Dados do Transporte</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">Modalidade e Transportadora</h4>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Frete:</span> {mockNFe.transp.modFrete}</p>
                        <p className="font-bold">{mockNFe.transp.transportadora.razao}</p>
                        <p>{mockNFe.transp.transportadora.cnpj} | {mockNFe.transp.transportadora.ie}</p>
                        <p className="text-muted-foreground text-xs">{mockNFe.transp.transportadora.endereco}</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">Veículo e Volumes</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><p className="text-muted-foreground">Placa / UF</p><p className="font-medium">{mockNFe.transp.veiculo.placa} / {mockNFe.transp.veiculo.uf}</p></div>
                        <div><p className="text-muted-foreground">Volumes</p><p className="font-medium">{mockNFe.transp.volumes.qtd} {mockNFe.transp.volumes.especie}</p></div>
                        <div><p className="text-muted-foreground">Peso Líquido</p><p className="font-medium">{mockNFe.transp.volumes.pesoL.toFixed(3)} Kg</p></div>
                        <div><p className="text-muted-foreground">Peso Bruto</p><p className="font-medium">{mockNFe.transp.volumes.pesoB.toFixed(3)} Kg</p></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Cobrança */}
            <TabsContent value="cobranca" className="m-0 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <CardTitle>Faturas e Duplicatas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-muted/50 p-4 rounded-lg grid grid-cols-3 gap-4 text-sm">
                    <div><p className="text-muted-foreground">Número Fatura</p><p className="font-bold">{mockNFe.cobr.fat.nFat}</p></div>
                    <div><p className="text-muted-foreground">Valor Original</p><p className="font-bold">R$ {mockNFe.cobr.fat.vOrig.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                    <div><p className="text-muted-foreground">Valor Líquido</p><p className="font-bold text-primary text-lg">R$ {mockNFe.cobr.fat.vLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left">Parcela</th>
                        <th className="px-4 py-2 text-left">Vencimento</th>
                        <th className="px-4 py-2 text-right">Valor</th>
                        <th className="px-4 py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockNFe.cobr.dupl.map((dupl, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="px-4 py-3">{dupl.nDup}</td>
                          <td className="px-4 py-3 font-medium">{new Date(dupl.dVenc).toLocaleDateString('pt-BR')}</td>
                          <td className="px-4 py-3 text-right font-bold">R$ {dupl.vDup.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant="outline" className={idx === 0 ? "text-amber-600 bg-amber-50" : "text-green-600 bg-green-50"}>
                              {idx === 0 ? "A vencer" : "A vencer"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Adicionais */}
            <TabsContent value="adicionais" className="m-0 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <CardTitle>Informações Adicionais</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Interesse do Contribuinte</h4>
                    <p className="text-sm bg-muted p-4 rounded-md italic text-muted-foreground leading-relaxed">
                      {mockNFe.infAdic.infCpl}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Interesse do Fisco</h4>
                    <p className="text-sm bg-muted p-4 rounded-md italic text-muted-foreground leading-relaxed">
                      {mockNFe.infAdic.infAdFisco}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Histórico */}
            <TabsContent value="historico" className="m-0 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <CardTitle>Eventos da NF-e</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
                    {mockNFe.eventos.map((evento, idx) => (
                      <div key={idx} className="relative flex items-center justify-between md:justify-start md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-primary text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                          <Clock className="h-5 w-5" />
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-muted bg-white shadow-sm">
                          <div className="flex items-center justify-between space-x-2 mb-1">
                            <div className="font-bold text-slate-900">{evento.tipo}</div>
                            <time className="font-mono text-xs font-medium text-primary">{evento.data}</time>
                          </div>
                          <div className="text-sm text-slate-500">{evento.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: XML */}
            <TabsContent value="xml" className="m-0">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-primary" />
                    <CardTitle>Visualizador XML</CardTitle>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(mockNFe.xml)}>
                    <Copy className="h-4 w-4 mr-2" /> Copiar XML
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="bg-slate-950 p-6 rounded-lg font-mono text-xs text-blue-300 overflow-x-auto">
                    <pre>{mockNFe.xml.replace(/></g, '>\n<')}</pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
      <NfeItemDrawer item={selectedItem} open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)} />
    </div>
  );
};
