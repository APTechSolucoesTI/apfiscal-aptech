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
    dataEmissao: "2026-07-20T10:00:00",
    status: "Autorizada"
  },
  emit: {
    razao: "EMPRESA EXEMPLO LTDA",
    cnpj: "12.345.678/0001-00"
  },
  dest: {
    razao: "CLIENTE EXEMPLO LTDA",
    cnpj: "98.765.432/0001-99"
  },
  total: {
    valorProdutos: 1000.00,
    valorTotal: 1000.00
  },
  items: [
    { id: "1", cod: "P001", desc: "Produto Exemplo A", qtd: 10, valorUnit: 100.00, total: 1000.00 }
  ]
};

export const NfeDetalhes = ({ nfeId }: { nfeId: string }) => {
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  return (
    <div className="flex flex-col h-full space-y-4 p-6">
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 p-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => window.history.back()}>Voltar</Button>
          <div>
            <h1 className="text-xl font-bold">NF-e nº {mockNFe.ide.numero} — Série {mockNFe.ide.serie}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="bg-green-100 text-green-800">Autorizada</Badge>
              <span>Chave: 1234...5678</span>
              <Button variant="ghost" size="icon" className="h-4 w-4"><Copy className="h-3 w-3"/></Button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Download className="mr-2 h-4 w-4"/> XML</Button>
          <Button variant="outline"><Download className="mr-2 h-4 w-4"/> DANFE</Button>
          <Button variant="outline"><Mail className="mr-2 h-4 w-4"/> Email</Button>
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
                    <tr key={item.id} className="border-b hover:bg-muted/50 cursor-pointer">
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
    </div>
  );
};
