import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/documents/nfse")({
  component: NFSeList,
});

const mockDocs = [
  {
    id: "1",
    numero: "2024001",
    data: "2026-07-10",
    prestador: "Limpeza e Conservação Brilho",
    valor: "R$ 800,00",
    status: "success",
    servico: "Serviços de Limpeza"
  },
  {
    id: "2",
    numero: "155",
    data: "2026-07-12",
    prestador: "Segurança Patrimonial Forte",
    valor: "R$ 2.500,00",
    status: "info",
    servico: "Vigilância"
  }
];

function NFSeList() {
  const { items: sortedDocs, requestSort, sortConfig } = useSortableData(mockDocs);
  const [selectedDoc, setSelectedDoc] = useState<typeof mockDocs[0] | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NFS-e (Serviços)</h1>
          <p className="text-slate-500">Notas fiscais de serviço tomados pela sua organização.</p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" /> Exportar
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar por prestador ou número..." className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead 
                  className="cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('numero')}
                >
                  <div className="flex items-center gap-1">
                    Número <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('data')}
                >
                  <div className="flex items-center gap-1">
                    Data <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('prestador')}
                >
                  <div className="flex items-center gap-1">
                    Prestador <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead 
                  className="cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('valor')}
                >
                  <div className="flex items-center gap-1">
                    Valor <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDocs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.numero}</TableCell>
                  <TableCell>{new Date(doc.data).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>{doc.prestador}</TableCell>
                  <TableCell>{doc.servico}</TableCell>
                  <TableCell>{doc.valor}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => {
                        setSelectedDoc(doc);
                        setIsDetailsOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Detalhes da NFS-e</DialogTitle>
            <DialogDescription>
              Informações detalhadas da nota de serviço selecionada.
            </DialogDescription>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-slate-500">Número da Nota</Label>
                  <p className="font-medium">{selectedDoc.numero}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500">Data de Emissão</Label>
                  <p className="font-medium">{new Date(selectedDoc.data).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-slate-500">Prestador do Serviço</Label>
                  <p className="font-medium">{selectedDoc.prestador}</p>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-slate-500">Serviço Prestado</Label>
                  <p className="font-medium">{selectedDoc.servico}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500">Valor Total</Label>
                  <p className="font-bold text-blue-600">{selectedDoc.valor}</p>
                </div>
              </div>
              <Separator />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

