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
} from "lucide-react";
import { Input } from "@/components/ui/input";

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
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Prestador</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDocs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.numero}</TableCell>
                  <TableCell>{new Date(doc.data).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>{doc.prestador}</TableCell>
                  <TableCell>{doc.servico}</TableCell>
                  <TableCell>{doc.valor}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
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
