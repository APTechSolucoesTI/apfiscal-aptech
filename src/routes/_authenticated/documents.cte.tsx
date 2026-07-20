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
import { Button } from "@/components/ui/button";
import { 
  Search, 
  Download, 
  Eye, 
} from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/documents/cte")({
  component: CTeList,
});

const mockDocs = [
  {
    id: "1",
    numero: "882",
    data: "2026-07-14",
    transportadora: "TransLog Rápido LTDA",
    valor: "R$ 350,00",
    origem: "São Paulo/SP",
    destino: "Curitiba/PR"
  }
];

function CTeList() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CT-e (Transporte)</h1>
          <p className="text-slate-500">Conhecimentos de transporte eletrônico.</p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" /> Exportar
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar por transportadora..." className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Transportadora</TableHead>
                <TableHead>Origem/Destino</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDocs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.numero}</TableCell>
                  <TableCell>{new Date(doc.data).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>{doc.transportadora}</TableCell>
                  <TableCell>{doc.origem} {'->'} {doc.destino}</TableCell>
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
