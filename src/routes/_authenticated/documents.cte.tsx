import { useState, useEffect, useMemo, type ReactNode } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Download, Eye, ArrowUpDown, Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSortableData } from "@/hooks/use-sortable-data";
import { useColumnPreferences, type ColumnDef } from "@/hooks/use-column-preferences";
import { ColumnSettings } from "@/components/common/ColumnSettings";
import { TablePagination } from "@/components/common/TablePagination";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteFiscalDocuments } from "@/lib/fiscal-documents.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/documents/cte")({
  component: CTeList,
});

type FiscalDoc = {
  id: string;
  numero: string | null;
  chave_acesso: string | null;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  valor_total: number | null;
  data_emissao: string | null;
};

type Row = FiscalDoc & { data_num: number; valor_num: number };

type Col = ColumnDef & { sortKey?: keyof Row; className?: string; headClassName?: string; render: (r: Row) => ReactNode };

function CTeList() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<FiscalDoc | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const removeMany = useServerFn(deleteFiscalDocuments);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["fiscal_documents", "cte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_documents")
        .select("id, numero, chave_acesso, emitente_cnpj, emitente_nome, valor_total, data_emissao")
        .eq("tipo", "cte")
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
          return !q || (d.numero ?? "").toLowerCase().includes(q) || (d.emitente_nome ?? "").toLowerCase().includes(q);
        })
        .map((d) => ({ ...d, data_num: d.data_emissao ? new Date(d.data_emissao).getTime() : 0, valor_num: Number(d.valor_total ?? 0) })),
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
      toast.success(`${r.count} CT-e excluído(s)`);
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
    if (!confirm(`Excluir ${selectedIds.size} CT-e selecionado(s)?`)) return;
    bulkDelMut.mutate(Array.from(selectedIds));
  }

  const columns: Col[] = useMemo(() => [
    { key: "numero", label: "Número", sortKey: "numero", className: "font-medium", render: (d) => d.numero ?? "-" },
    { key: "data", label: "Data", sortKey: "data_num", render: (d) => (d.data_emissao ? new Date(d.data_emissao).toLocaleDateString("pt-BR") : "-") },
    { key: "transportadora", label: "Transportadora", sortKey: "emitente_nome", render: (d) => d.emitente_nome ?? d.emitente_cnpj ?? "-" },
    { key: "cnpj", label: "CNPJ", render: (d) => d.emitente_cnpj ?? "-" },
    { key: "valor", label: "Valor", sortKey: "valor_num", render: (d) => Number(d.valor_total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
    { key: "chave", label: "Chave", render: (d) => <span className="font-mono text-[10px]">{d.chave_acesso ?? "-"}</span> },
    { key: "actions", label: "Ações", alwaysVisible: true, headClassName: "text-right", className: "text-right", render: (d) => (
      <Button variant="ghost" size="icon" onClick={() => { setSelectedDoc(d); setIsDetailsOpen(true); }}>
        <Eye className="h-4 w-4" />
      </Button>
    ) },
  ], []);

  const { visibleColumns, allColumns, isVisible, toggleVisible, moveColumn, reset, pageSize, setPageSize } = useColumnPreferences("cte", columns);
  const visibleCols = useMemo(() => visibleColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean), [visibleColumns, columns]);
  const orderedCols = useMemo(() => allColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean), [allColumns, columns]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, pageSize, sortedDocs.length]);
  const pagedDocs = useMemo(() => sortedDocs.slice((page - 1) * pageSize, page * pageSize), [sortedDocs, page, pageSize]);

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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por transportadora..."
                className="max-w-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ColumnSettings columns={orderedCols} isVisible={isVisible} toggleVisible={toggleVisible} moveColumn={moveColumn} reset={reset} pageSize={pageSize} onPageSizeChange={setPageSize} />
          </div>
        </CardHeader>
        <CardContent>
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between px-3 py-2 mb-3 rounded border bg-amber-50">
              <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDelMut.isPending}>
                  {bulkDelMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Excluir selecionados
                </Button>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : sortedDocs.length === 0 ? (
            <div className="text-center py-16 text-slate-500">Nenhum CT-e cadastrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  {visibleCols.map((c) => (
                    <TableHead
                      key={c.key}
                      className={`${c.headClassName ?? ""} ${c.sortKey ? "cursor-pointer" : ""}`}
                      onClick={c.sortKey ? () => requestSort(c.sortKey!) : undefined}
                    >
                      <div className="flex items-center gap-1">{c.label}{c.sortKey && <ArrowUpDown className="h-3 w-3" />}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedDocs.map((doc) => (
                  <TableRow key={doc.id} data-state={selectedIds.has(doc.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(doc.id)}
                        onCheckedChange={() => toggleRow(doc.id)}
                        aria-label={`Selecionar CT-e ${doc.numero ?? doc.id}`}
                      />
                    </TableCell>
                    {visibleCols.map((c) => (
                      <TableCell key={c.key} className={c.className}>{c.render(doc)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} pageSize={pageSize} total={sortedDocs.length} onPageChange={setPage} />
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Detalhes do CT-e</DialogTitle>
            <DialogDescription>Informações do Conhecimento de Transporte Eletrônico.</DialogDescription>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-slate-500">Número</Label><p className="font-medium">{selectedDoc.numero ?? "-"}</p></div>
                <div><Label className="text-slate-500">Data</Label><p className="font-medium">{selectedDoc.data_emissao ? new Date(selectedDoc.data_emissao).toLocaleDateString("pt-BR") : "-"}</p></div>
                <div className="col-span-2"><Label className="text-slate-500">Transportadora</Label><p className="font-medium">{selectedDoc.emitente_nome ?? "-"}</p></div>
                <div><Label className="text-slate-500">CNPJ</Label><p className="font-medium">{selectedDoc.emitente_cnpj ?? "-"}</p></div>
                <div><Label className="text-slate-500">Valor</Label><p className="font-bold text-blue-600">{Number(selectedDoc.valor_total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
                <div className="col-span-2"><Label className="text-slate-500">Chave</Label><p className="font-mono text-xs break-all">{selectedDoc.chave_acesso ?? "-"}</p></div>
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
