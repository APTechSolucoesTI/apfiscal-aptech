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
  FileDown
} from "lucide-react";
import { Input } from "@/components/ui/input";

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
    valor: "R$ 1.250,00",
    manifesto: "Confirmada",
    status: "success",
    chave: "35260712345678000190550010000004521000004521"
  },
  {
    id: "2",
    numero: "8901",
    serie: "1",
    data: "2026-07-18",
    emitente: "Distribuidora de Papelaria XYZ",
    valor: "R$ 450,20",
    manifesto: "Pendente",
    status: "warning",
    chave: "35260798765432000110550010000089011000089012"
  },
  {
    id: "3",
    numero: "22",
    serie: "3",
    data: "2026-07-20",
    emitente: "Consultoria de TI Global",
    valor: "R$ 15.000,00",
    manifesto: "Ciência",
    status: "info",
    chave: "35260745678901000122550030000000221000000223"
  }
];

function NFeList() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NF-e (Produtos)</h1>
          <p className="text-slate-500">Acompanhe as notas fiscais de produto emitidas contra seus CNPJs.</p>
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
                <TableHead className="w-[100px] text-slate-500 font-semibold">Número</TableHead>
                <TableHead className="text-slate-500 font-semibold">Emissão</TableHead>
                <TableHead className="text-slate-500 font-semibold">Fornecedor (Emitente)</TableHead>
                <TableHead className="text-slate-500 font-semibold">Valor</TableHead>
                <TableHead className="text-slate-500 font-semibold">Manifestação</TableHead>
                <TableHead className="text-right text-slate-500 font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDocs.map((doc) => (
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" title="Ver detalhes">
                        <Eye className="h-4 w-4" />
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
    </div>
  );
}
