import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Download, Eye, ArrowUpDown, Loader2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/documents/nfse")({
  component: NFSeList,
});

type FiscalDoc = {
  id: string;
  numero: string | null;
  chave_acesso: string | null;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  valor_total: number | null;
  data_emissao: string | null;
  status_manifestacao: string | null;
};

type Row = FiscalDoc & { data_num: number; valor_num: number };

function NFSeList() {
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<FiscalDoc | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["fiscal_documents", "nfse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_documents")
        .select("id, numero, chave_acesso, emitente_cnpj, emitente_nome, valor_total, data_emissao, status_manifestacao")
        .eq("tipo", "nfse")
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FiscalDoc[];
    },
  });

  const rows: Row[] = docs
    .filter((d) => {
      const q = search.toLowerCase();
      return !q || (d.numero ?? "").toLowerCase().includes(q) || (d.emitente_nome ?? "").toLowerCase().includes(q);
    })
    .map((d) => ({ ...d, data_num: d.data_emissao ? new Date(d.data_emissao).getTime() : 0, valor_num: Number(d.valor_total ?? 0) }));

  const { items: sortedDocs, requestSort } = useSortableData(rows);

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
            <Input
              placeholder="Buscar por prestador ou número..."
              className="max-w-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : sortedDocs.length === 0 ? (
            <div className="text-center py-16 text-slate-500">Nenhuma NFS-e cadastrada.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="cursor-pointer" onClick={() => requestSort("numero")}>
                    <div className="flex items-center gap-1">Número <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => requestSort("data_num")}>
                    <div className="flex items-center gap-1">Data <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => requestSort("emitente_nome")}>
                    <div className="flex items-center gap-1">Prestador <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => requestSort("valor_num")}>
                    <div className="flex items-center gap-1">Valor <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDocs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.numero ?? "-"}</TableCell>
                    <TableCell>{doc.data_emissao ? new Date(doc.data_emissao).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell>{doc.emitente_nome ?? doc.emitente_cnpj ?? "-"}</TableCell>
                    <TableCell>{Number(doc.valor_total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedDoc(doc); setIsDetailsOpen(true); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Detalhes da NFS-e</DialogTitle>
            <DialogDescription>Informações da nota de serviço selecionada.</DialogDescription>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-slate-500">Número</Label><p className="font-medium">{selectedDoc.numero ?? "-"}</p></div>
                <div><Label className="text-slate-500">Data</Label><p className="font-medium">{selectedDoc.data_emissao ? new Date(selectedDoc.data_emissao).toLocaleDateString("pt-BR") : "-"}</p></div>
                <div className="col-span-2"><Label className="text-slate-500">Prestador</Label><p className="font-medium">{selectedDoc.emitente_nome ?? "-"}</p></div>
                <div className="col-span-2"><Label className="text-slate-500">CNPJ Emitente</Label><p className="font-medium">{selectedDoc.emitente_cnpj ?? "-"}</p></div>
                <div><Label className="text-slate-500">Valor Total</Label><p className="font-bold text-blue-600">{Number(selectedDoc.valor_total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
                <div><Label className="text-slate-500">Chave</Label><p className="font-mono text-xs break-all">{selectedDoc.chave_acesso ?? "-"}</p></div>
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
