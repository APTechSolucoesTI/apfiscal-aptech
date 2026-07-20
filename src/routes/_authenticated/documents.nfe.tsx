import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  Filter, 
  Download, 
  Eye, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileDown,
  ArrowUpDown,
  Info
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSortableData } from "@/hooks/use-sortable-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";


export const Route = createFileRoute("/_authenticated/documents/nfe")({
  component: NFeList,
});

const mockDocs = [
  {
    id: "1",
    numero: "452",
    serie: "1",
    data: "2026-07-15",
    emitente: "Fornecedor de Software ABC",
    emitente_cnpj: "12.345.678/0001-90",
    destinatario: "Minha Empresa LTDA",
    destinatario_cnpj: "98.765.432/0001-21",
    valor_num: 1250.00,
    valor: "R$ 1.250,00",
    manifesto: "Confirmada",
    status: "success",
    chave: "35260712345678000190550010000004521000004521",
    base_icms: "R$ 1.250,00",
    valor_icms: "R$ 225,00",
    valor_ipi: "R$ 0,00",
    valor_pis: "R$ 20,63",
    valor_cofins: "R$ 95,00",
    frete: "R$ 0,00",
    seguro: "R$ 0,00",
    desconto: "R$ 0,00",
    itens: [
      { id: 1, codigo: "001", descricao: "Licença de Software SaaS", ncm: "85234911", cfop: "5102", un: "UN", qtd: 1, valor_unit: 1250.00, valor_total: 1250.00 },
    ]
  },
  {
    id: "2",
    numero: "8901",
    serie: "1",
    data: "2026-07-18",
    emitente: "Distribuidora de Papelaria XYZ",
    emitente_cnpj: "45.678.901/0001-33",
    destinatario: "Minha Empresa LTDA",
    destinatario_cnpj: "98.765.432/0001-21",
    valor_num: 450.20,
    valor: "R$ 450,20",
    manifesto: "Pendente",
    status: "warning",
    chave: "35260798765432000110550010000089011000089012",
    base_icms: "R$ 450,20",
    valor_icms: "R$ 81,04",
    valor_ipi: "R$ 12,50",
    valor_pis: "R$ 7,43",
    valor_cofins: "R$ 34,22",
    frete: "R$ 15,00",
    seguro: "R$ 0,00",
    desconto: "R$ 5,00",
    itens: [
      { id: 1, codigo: "PAP-01", descricao: "Papel A4 500fls", ncm: "48025610", cfop: "5102", un: "PCT", qtd: 10, valor_unit: 35.00, valor_total: 350.00 },
      { id: 2, codigo: "CAN-02", descricao: "Caneta Azul Luxo", ncm: "96081000", cfop: "5102", un: "UN", qtd: 5, valor_unit: 20.04, valor_total: 100.20 },
    ]
  },
  {
    id: "3",
    numero: "22",
    serie: "3",
    data: "2026-07-20",
    emitente: "Consultoria de TI Global",
    emitente_cnpj: "77.888.999/0001-11",
    destinatario: "Minha Empresa LTDA",
    destinatario_cnpj: "98.765.432/0001-21",
    valor_num: 15000.00,
    valor: "R$ 15.000,00",
    manifesto: "Ciência",
    status: "info",
    chave: "35260745678901000122550030000000221000000223",
    base_icms: "R$ 0,00",
    valor_icms: "R$ 0,00",
    valor_ipi: "R$ 0,00",
    valor_pis: "R$ 247,50",
    valor_cofins: "R$ 1140,00",
    frete: "R$ 0,00",
    seguro: "R$ 0,00",
    desconto: "R$ 0,00",
    itens: [
      { id: 1, codigo: "SERV-01", descricao: "Consultoria em Segurança", ncm: "00000000", cfop: "5933", un: "HRS", qtd: 40, valor_unit: 375.00, valor_total: 15000.00 },
    ]
  }
];


function NFeList() {
  const { items: sortedDocs, requestSort, sortConfig } = useSortableData(mockDocs);
  const [selectedDoc, setSelectedDoc] = useState<typeof mockDocs[0] | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (

    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NF-e (Produtos)</h1>
          <p className="text-slate-500 text-xs mt-1 italic">Clique no ícone 👁️ na coluna "Ações" da listagem da nota fiscal eletronica deverá abrir a tela de detalhamento completo da NF-e. Em (documents.nfe.tsx) usa &lt;Link to="/documents/nfe/$nfeId" params=&#123;&#123; nfeId: doc.id &#125;&#125;&gt; que navega para a rota documents.nfe.$nfeId.tsx, renderizando o componente NfeDetalhes com todas as abas (Resumo, Itens, Impostos, Transporte, Cobrança, Adicionais, Histórico, XML).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
          <Button variant="outline">
            <FileDown className="mr-2 h-4 w-4" /> Baixar XMLs (Lote)
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Buscar por número ou fornecedor..." className="pl-9 bg-white border-slate-200" />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" /> Filtros
              </Button>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-green-500" /> 
                <span>28 Confirmadas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-500" /> 
                <span>14 Pendentes</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100 bg-slate-50/30">
                <TableHead 
                  className="w-[120px] text-slate-500 font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('numero')}
                >
                  <div className="flex items-center gap-1">
                    Número <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-slate-500 font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('data')}
                >
                  <div className="flex items-center gap-1">
                    Emissão <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-slate-500 font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('emitente')}
                >
                  <div className="flex items-center gap-1">
                    Fornecedor <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                  <TableHead 
                    className="text-slate-500 font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={() => requestSort('valor_num')}
                  >

                  <div className="flex items-center gap-1">
                    Valor <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="text-slate-500 font-semibold">Manifestação</TableHead>
                <TableHead className="text-right text-slate-500 font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDocs.map((doc) => (

                <TableRow key={doc.id} className="border-slate-100 hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-medium text-slate-900">
                    <div className="flex flex-col">
                      <span>{doc.numero}</span>
                      <span className="text-[10px] text-slate-400">Série {doc.serie}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm whitespace-nowrap">
                    {new Date(doc.data).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[280px]">
                      <div className="font-medium text-slate-900 truncate">{doc.emitente}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate tracking-tight">{doc.chave}</div>
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900 text-sm">
                    {doc.valor}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="secondary" 
                      className={`
                        font-medium text-xs px-2 py-0.5 rounded-full
                        ${doc.status === 'success' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                        ${doc.status === 'warning' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' : ''}
                        ${doc.status === 'info' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : ''}
                      `}
                    >
                      {doc.status === 'success' && <CheckCircle2 className="mr-1 h-3 w-3 inline" />}
                      {doc.status === 'warning' && <Clock className="mr-1 h-3 w-3 inline" />}
                      {doc.status === 'info' && <AlertCircle className="mr-1 h-3 w-3 inline" />}
                      {doc.manifesto}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-blue-600 hover:bg-blue-50" 
                        title="Ver detalhes"
                        asChild
                      >
                        <Link to="/documents/nfe/$nfeId" params={{ nfeId: doc.id }}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>

                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600" title="Baixar XML">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[850px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <div className="flex justify-between items-start">
              <div>
                <DialogTitle className="text-xl">Detalhes da NF-e nº {selectedDoc?.numero}</DialogTitle>
                <DialogDescription>
                  Chave: <span className="font-mono text-xs">{selectedDoc?.chave}</span>
                </DialogDescription>
              </div>
              <Badge 
                variant="outline" 
                className={`
                  ${selectedDoc?.status === 'success' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                  ${selectedDoc?.status === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                  ${selectedDoc?.status === 'info' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                `}
              >
                {selectedDoc?.manifesto}
              </Badge>
            </div>
          </DialogHeader>

          {selectedDoc && (
            <div className="flex-1 overflow-hidden flex flex-col mt-4">
              <Tabs defaultValue="geral" className="w-full flex-1 flex flex-col">
                <div className="px-6 border-b">
                  <TabsList className="w-full justify-start h-12 bg-transparent gap-6 p-0">
                    <TabsTrigger value="geral" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full bg-transparent px-2">Dados Gerais</TabsTrigger>
                    <TabsTrigger value="transporte" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full bg-transparent px-2">Transporte</TabsTrigger>
                    <TabsTrigger value="impostos" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full bg-transparent px-2">Impostos</TabsTrigger>
                    <TabsTrigger value="itens" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full bg-transparent px-2">Itens da Nota</TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-6">
                    <TabsContent value="geral" className="mt-0 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <h4 className="font-semibold text-sm text-slate-900 uppercase tracking-wider">Emitente</h4>
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-2">
                            <div>
                              <Label className="text-[10px] text-slate-500 uppercase">Razão Social</Label>
                              <p className="text-sm font-medium">{selectedDoc.emitente}</p>
                            </div>
                            <div>
                              <Label className="text-[10px] text-slate-500 uppercase">CNPJ</Label>
                              <p className="text-sm font-medium">{selectedDoc.emitente_cnpj}</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="font-semibold text-sm text-slate-900 uppercase tracking-wider">Destinatário</h4>
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-2">
                            <div>
                              <Label className="text-[10px] text-slate-500 uppercase">Razão Social</Label>
                              <p className="text-sm font-medium">{selectedDoc.destinatario}</p>
                            </div>
                            <div>
                              <Label className="text-[10px] text-slate-500 uppercase">CNPJ</Label>
                              <p className="text-sm font-medium">{selectedDoc.destinatario_cnpj}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <Label className="text-[10px] text-slate-500 uppercase">Data Emissão</Label>
                          <p className="text-sm font-medium">{new Date(selectedDoc.data).toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-500 uppercase">Série</Label>
                          <p className="text-sm font-medium">{selectedDoc.serie}</p>
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-500 uppercase">Modelo</Label>
                          <p className="text-sm font-medium">55 (NF-e)</p>
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-500 uppercase">Valor Total</Label>
                          <p className="text-sm font-bold text-blue-600">{selectedDoc.valor}</p>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="transporte" className="mt-0 space-y-4">
                      <div className="bg-slate-50 p-8 rounded-lg border border-dashed border-slate-300 text-center">
                        <p className="text-slate-500 text-sm">Informações de transportadora e volumes não informados no XML.</p>
                      </div>
                    </TabsContent>

                    <TabsContent value="impostos" className="mt-0 space-y-6">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg">
                          <Label className="text-[10px] text-blue-600 uppercase font-bold">Base de Cálculo ICMS</Label>
                          <p className="text-lg font-semibold text-slate-900">{selectedDoc.base_icms}</p>
                        </div>
                        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg">
                          <Label className="text-[10px] text-blue-600 uppercase font-bold">Valor ICMS</Label>
                          <p className="text-lg font-semibold text-slate-900">{selectedDoc.valor_icms}</p>
                        </div>
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
                          <Label className="text-[10px] text-slate-500 uppercase font-bold">Valor IPI</Label>
                          <p className="text-lg font-semibold text-slate-900">{selectedDoc.valor_ipi}</p>
                        </div>
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
                          <Label className="text-[10px] text-slate-500 uppercase font-bold">Valor PIS</Label>
                          <p className="text-lg font-semibold text-slate-900">{selectedDoc.valor_pis}</p>
                        </div>
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
                          <Label className="text-[10px] text-slate-500 uppercase font-bold">Valor COFINS</Label>
                          <p className="text-lg font-semibold text-slate-900">{selectedDoc.valor_cofins}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 border-t pt-6">
                        <div>
                          <Label className="text-[10px] text-slate-500 uppercase tracking-tight">Vlr. Frete</Label>
                          <p className="text-sm font-medium">{selectedDoc.frete}</p>
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-500 uppercase tracking-tight">Vlr. Seguro</Label>
                          <p className="text-sm font-medium">{selectedDoc.seguro}</p>
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-500 uppercase tracking-tight">Vlr. Desconto</Label>
                          <p className="text-sm font-medium text-red-600">{selectedDoc.desconto}</p>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="itens" className="mt-0">
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50/50">
                              <TableHead className="text-[10px] uppercase font-bold">Cod.</TableHead>
                              <TableHead className="text-[10px] uppercase font-bold">Descrição</TableHead>
                              <TableHead className="text-[10px] uppercase font-bold">Qtd.</TableHead>
                              <TableHead className="text-[10px] uppercase font-bold text-right">Unitário</TableHead>
                              <TableHead className="text-[10px] uppercase font-bold text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedDoc.itens.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="text-xs font-mono">{item.codigo}</TableCell>
                                <TableCell className="text-xs">
                                  <div className="font-medium">{item.descricao}</div>
                                  <div className="text-[9px] text-slate-400">NCM: {item.ncm} | CFOP: {item.cfop}</div>
                                </TableCell>
                                <TableCell className="text-xs">{item.qtd} {item.un}</TableCell>
                                <TableCell className="text-xs text-right">R$ {item.valor_unit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-xs text-right font-semibold">R$ {item.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                  </div>
                </ScrollArea>
              </Tabs>
            </div>
          )}

          <DialogFooter className="p-6 pt-2 border-t bg-slate-50/30 gap-2">
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
            <Button className="bg-blue-600 shadow-sm hover:bg-blue-700">
              <Download className="mr-2 h-4 w-4" /> Baixar XML Completo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
