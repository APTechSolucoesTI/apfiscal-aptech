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
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  ArrowUpDown 
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/documents/nfse")({
  component: NFSeList,
});

const initialDocs = [
  { id: "1", numero: "2024001", data: "2026-07-10", prestador: "Limpeza e Conservação Brilho", valor: 800.00, servico: "Serviços de Limpeza" },
  { id: "2", numero: "155", data: "2026-07-12", prestador: "Segurança Patrimonial Forte", valor: 2500.00, servico: "Vigilância" },
];

function NFSeList() {
  const [docs, setDocs] = useState(initialDocs);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    const sortedDocs = [...docs].sort((a, b) => {
      const aVal = a[key as keyof typeof a];
      const bVal = b[key as keyof typeof b];
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    setDocs(sortedDocs);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NFS-e (Serviços)</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
           <Input placeholder="Buscar..." className="max-w-sm" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead onClick={() => handleSort('numero')} className="cursor-pointer">
                  Número <ArrowUpDown className="inline h-4 w-4" />
                </TableHead>
                <TableHead onClick={() => handleSort('data')} className="cursor-pointer">
                  Data <ArrowUpDown className="inline h-4 w-4" />
                </TableHead>
                <TableHead onClick={() => handleSort('prestador')} className="cursor-pointer">
                  Prestador <ArrowUpDown className="inline h-4 w-4" />
                </TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead onClick={() => handleSort('valor')} className="cursor-pointer">
                  Valor <ArrowUpDown className="inline h-4 w-4" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>{doc.numero}</TableCell>
                  <TableCell>{new Date(doc.data).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>{doc.prestador}</TableCell>
                  <TableCell>{doc.servico}</TableCell>
                  <TableCell>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(doc.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
