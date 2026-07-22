import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSortableData } from "@/hooks/use-sortable-data";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteFiscalDocuments } from "@/lib/fiscal-documents.functions";
import { importNfeXml } from "@/lib/nfe-import.functions";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/documents/nfe/")({
  component: NFeList,
});

type FiscalDoc = {
  id: string;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  valor_total: number | null;
  status_manifestacao: string | null;
  data_emissao: string | null;
};

type Row = FiscalDoc & {
  data_num: number;
  valor_num: number;
};

function statusStyle(status: string | null) {
  const s = (status ?? "pendente").toLowerCase();
  if (s.includes("confirm")) return { color: "bg-green-100 text-green-700 hover:bg-green-100", icon: CheckCircle2, label: "Confirmada" };
  if (s.includes("cien")) return { color: "bg-blue-100 text-blue-700 hover:bg-blue-100", icon: AlertCircle, label: "Ciência" };
  return { color: "bg-amber-100 text-amber-700 hover:bg-amber-100", icon: Clock, label: status ?? "Pendente" };
}

function NFeList() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const removeMany = useServerFn(deleteFiscalDocuments);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["fiscal_documents", "nfe"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_documents")
        .select("id, numero, serie, chave_acesso, emitente_cnpj, emitente_nome, valor_total, status_manifestacao, data_emissao")
        .eq("tipo", "nfe")
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FiscalDoc[];
    },
  });

  const rows: Row[] = useMemo(
    () =>
      docs
        .filter((d) => {
          const q = search.toLowerCase();
          if (!q) return true;
          return (
            (d.numero ?? "").toLowerCase().includes(q) ||
            (d.emitente_nome ?? "").toLowerCase().includes(q) ||
            (d.chave_acesso ?? "").toLowerCase().includes(q)
          );
        })
        .map((d) => ({
          ...d,
          data_num: d.data_emissao ? new Date(d.data_emissao).getTime() : 0,
          valor_num: Number(d.valor_total ?? 0),
        })),
    [docs, search],
  );

  const { items: sortedDocs, requestSort } = useSortableData(rows);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(sortedDocs.map((d) => d.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (visible.has(id)) next.add(id); });
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [sortedDocs]);

  const allChecked = sortedDocs.length > 0 && sortedDocs.every((d) => selectedIds.has(d.id));
  const someChecked = selectedIds.size > 0 && !allChecked;

  const bulkDelMut = useMutation({
    mutationFn: (ids: string[]) => removeMany({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`${r.count} nota(s) excluída(s)`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["fiscal_documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleAll() {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(sortedDocs.map((d) => d.id)));
  }
  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir ${selectedIds.size} nota(s) selecionada(s)? Esta ação não pode ser desfeita.`)) return;
    bulkDelMut.mutate(Array.from(selectedIds));
  }

  const totalConfirmed = docs.filter((d) => (d.status_manifestacao ?? "").toLowerCase().includes("confirm")).length;
  const totalPending = docs.length - totalConfirmed;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NF-e (Produtos)</h1>
          <p className="text-slate-500">Notas fiscais eletrônicas recebidas.</p>
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
                <Input
                  placeholder="Buscar por número, fornecedor ou chave..."
                  className="pl-9 bg-white border-slate-200"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" /> Filtros
              </Button>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span>{totalConfirmed} Confirmadas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span>{totalPending} Pendentes</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between px-4 py-2 border-b bg-amber-50">
              <span className="text-sm font-medium">{selectedIds.size} selecionada(s)</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDelMut.isPending}>
                  {bulkDelMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Excluir selecionadas
                </Button>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : sortedDocs.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <p className="font-medium">Nenhuma NF-e capturada ainda.</p>
              <p className="text-sm mt-1">Cadastre uma empresa com certificado A1 para começar a receber notas.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100 bg-slate-50/30">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todas"
                    />
                  </TableHead>
                  <TableHead className="w-[120px] text-slate-500 font-semibold cursor-pointer" onClick={() => requestSort("numero")}>
                    <div className="flex items-center gap-1">Número <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="text-slate-500 font-semibold cursor-pointer" onClick={() => requestSort("data_num")}>
                    <div className="flex items-center gap-1">Emissão <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="text-slate-500 font-semibold cursor-pointer" onClick={() => requestSort("emitente_nome")}>
                    <div className="flex items-center gap-1">Fornecedor <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="text-slate-500 font-semibold cursor-pointer" onClick={() => requestSort("valor_num")}>
                    <div className="flex items-center gap-1">Valor <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="text-slate-500 font-semibold">Manifestação</TableHead>
                  <TableHead className="text-right text-slate-500 font-semibold">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDocs.map((doc) => {
                  const st = statusStyle(doc.status_manifestacao);
                  const Icon = st.icon;
                  return (
                    <TableRow key={doc.id} className="border-slate-100 hover:bg-slate-50/80 transition-colors" data-state={selectedIds.has(doc.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(doc.id)}
                          onCheckedChange={() => toggleRow(doc.id)}
                          aria-label={`Selecionar NF-e ${doc.numero ?? doc.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        <div className="flex flex-col">
                          <span>{doc.numero ?? "-"}</span>
                          <span className="text-[10px] text-slate-400">Série {doc.serie ?? "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm whitespace-nowrap">
                        {doc.data_emissao ? new Date(doc.data_emissao).toLocaleDateString("pt-BR") : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[280px]">
                          <div className="font-medium text-slate-900 truncate">{doc.emitente_nome ?? doc.emitente_cnpj ?? "-"}</div>
                          <div className="text-[10px] text-slate-400 font-mono truncate tracking-tight">{doc.chave_acesso ?? ""}</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900 text-sm">
                        {Number(doc.valor_total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`font-medium text-xs px-2 py-0.5 rounded-full ${st.color}`}>
                          <Icon className="mr-1 h-3 w-3 inline" />
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" title="Ver detalhes" asChild>
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
