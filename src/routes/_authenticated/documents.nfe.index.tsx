import { useState, useEffect, useMemo, type ReactNode } from "react";
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
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSortableData } from "@/hooks/use-sortable-data";
import { useColumnPreferences, type ColumnDef } from "@/hooks/use-column-preferences";
import { ColumnSettings } from "@/components/common/ColumnSettings";
import { TablePagination } from "@/components/common/TablePagination";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteFiscalDocuments } from "@/lib/fiscal-documents.functions";
import { importNfeXml } from "@/lib/nfe-import.functions";
import { toast } from "sonner";
import { baixarXmlUnico, baixarXmlsZip } from "@/lib/xml-zip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NfeAprovacaoDialog } from "@/components/nfe/NfeAprovacaoDialog";
import { NFE_STATUS_ORDER, statusConfig, podeAprovar, type NfeStatus } from "@/lib/nfe-status";



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
  status: NfeStatus | null;
  data_emissao: string | null;
};

type Row = FiscalDoc & {
  data_num: number;
  valor_num: number;
};

type Col = ColumnDef & { sortKey?: keyof Row; className?: string; headClassName?: string; render: (r: Row) => ReactNode };

function NFeList() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [aprovarId, setAprovarId] = useState<string | null>(null);
  const removeMany = useServerFn(deleteFiscalDocuments);
  const importXml = useServerFn(importNfeXml);


  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["fiscal_documents", "nfe"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_documents")
        .select("id, numero, serie, chave_acesso, emitente_cnpj, emitente_nome, valor_total, status, data_emissao")
        .eq("tipo", "nfe")
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FiscalDoc[];
    },
  });

  const rows: Row[] = useMemo(() => {
    const de = dataInicio ? new Date(`${dataInicio}T00:00:00`).getTime() : null;
    const ate = dataFim ? new Date(`${dataFim}T23:59:59`).getTime() : null;
    return docs
      .filter((d) => {
        const q = search.toLowerCase();
        if (!q) return true;
        return (
          (d.numero ?? "").toLowerCase().includes(q) ||
          (d.emitente_nome ?? "").toLowerCase().includes(q) ||
          (d.chave_acesso ?? "").toLowerCase().includes(q)
        );
      })
      .filter((d) => (statusFilter === "todos" ? true : (d.status ?? "pendente_confirmacao") === statusFilter))
      .filter((d) => {
        if (!de && !ate) return true;
        if (!d.data_emissao) return false;
        const t = new Date(d.data_emissao).getTime();
        if (de && t < de) return false;
        if (ate && t > ate) return false;
        return true;
      })
      .map((d) => ({
        ...d,
        data_num: d.data_emissao ? new Date(d.data_emissao).getTime() : 0,
        valor_num: Number(d.valor_total ?? 0),
      }));
  }, [docs, search, dataInicio, dataFim, statusFilter]);


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

  async function buscarXmls(ids: string[]) {
    const { data, error } = await supabase
      .from("fiscal_documents")
      .select("id, numero, chave_acesso, xml_content")
      .in("id", ids);
    if (error) throw error;
    return (data ?? []).filter((d) => !!d.xml_content) as {
      id: string;
      numero: string | null;
      chave_acesso: string | null;
      xml_content: string;
    }[];
  }

  const bulkXmlMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const found = await buscarXmls(ids);
      if (found.length === 0) throw new Error("Nenhuma das notas selecionadas possui XML armazenado.");
      await baixarXmlsZip(
        found.map((d) => ({
          nome: `${d.chave_acesso ?? d.numero ?? d.id}.xml`,
          conteudo: d.xml_content,
        })),
        `nfe-xmls-${new Date().toISOString().slice(0, 10)}.zip`,
      );
      return { baixados: found.length, total: ids.length };
    },
    onSuccess: ({ baixados, total }) => {
      toast.success(`${baixados} XML(s) compactado(s) em ZIP.`);
      if (baixados < total) toast.warning(`${total - baixados} nota(s) sem XML armazenado.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleDownloadOne(doc: Row) {
    try {
      const found = await buscarXmls([doc.id]);
      if (found.length === 0) throw new Error("Esta NF-e não possui XML armazenado.");
      baixarXmlUnico(`${found[0].chave_acesso ?? found[0].numero ?? doc.id}.xml`, found[0].xml_content);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao baixar XML.");
    }
  }


  const importMut = useMutation({
    mutationFn: async (files: File[]) => {
      const results: Array<{ name: string; ok: boolean; duplicated?: boolean; message: string }> = [];
      for (const f of files) {
        try {
          const xml = await f.text();
          const r = await importXml({ data: { fileName: f.name, xml } });
          if (r.ok) {
            results.push({ name: f.name, ok: true, message: `Importada para ${r.companyName} (${r.itemCount} item(ns))` });
          } else if (r.duplicated) {
            results.push({
              name: f.name,
              ok: false,
              duplicated: true,
              message: r.message ?? "Esta NF-e já foi importada anteriormente.",
            });
          } else {
            results.push({ name: f.name, ok: false, message: "Falha desconhecida" });
          }
        } catch (e) {
          results.push({ name: f.name, ok: false, message: e instanceof Error ? e.message : "Erro" });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const ok = results.filter((r) => r.ok).length;
      const dup = results.filter((r) => r.duplicated).length;
      const err = results.length - ok - dup;
      if (ok) toast.success(`${ok} NF-e importada(s)`);
      if (dup) toast.warning(`${dup} já existente(s)`);
      if (err) toast.error(`${err} com erro`);
      results.filter((r) => !r.ok && !r.duplicated).forEach((r) => toast.error(`${r.name}: ${r.message}`));
      qc.invalidateQueries({ queryKey: ["fiscal_documents"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setImportOpen(false);
      setImportFiles([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalIntegradas = docs.filter((d) => d.status === "integrado_totvs").length;
  const totalPending = docs.filter((d) => (d.status ?? "pendente_confirmacao") === "pendente_confirmacao").length;

  const columns: Col[] = useMemo(() => [
    { key: "numero", label: "Número", sortKey: "numero", headClassName: "w-[120px] text-slate-500 font-semibold", className: "font-medium text-slate-900", render: (doc) => (
      <div className="flex flex-col">
        <span>{doc.numero ?? "-"}</span>
        <span className="text-[10px] text-slate-400">Série {doc.serie ?? "-"}</span>
      </div>
    ) },
    { key: "emissao", label: "Emissão", sortKey: "data_num", headClassName: "text-slate-500 font-semibold", className: "text-slate-600 text-sm whitespace-nowrap", render: (doc) => (doc.data_emissao ? new Date(doc.data_emissao).toLocaleDateString("pt-BR") : "-") },
    { key: "fornecedor", label: "Fornecedor", sortKey: "emitente_nome", headClassName: "text-slate-500 font-semibold", render: (doc) => (
      <div className="max-w-[280px]">
        <div className="font-medium text-slate-900 truncate">{doc.emitente_nome ?? doc.emitente_cnpj ?? "-"}</div>
        <div className="text-[10px] text-slate-400 font-mono truncate tracking-tight">{doc.chave_acesso ?? ""}</div>
      </div>
    ) },
    { key: "cnpj", label: "CNPJ Emitente", headClassName: "text-slate-500 font-semibold", className: "font-mono text-xs text-slate-600", render: (doc) => doc.emitente_cnpj ?? "-" },
    { key: "valor", label: "Valor", sortKey: "valor_num", headClassName: "text-slate-500 font-semibold", className: "font-semibold text-slate-900 text-sm", render: (doc) => Number(doc.valor_total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
    { key: "status", label: "Status", headClassName: "text-slate-500 font-semibold", render: (doc) => {
      const st = statusConfig(doc.status);
      return (
        <Badge variant="secondary" className={`font-medium text-xs px-2 py-0.5 rounded-full border ${st.badge}`}>
          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${st.dot}`} />
          {st.label}
        </Badge>
      );
    } },
    { key: "actions", label: "Ações", alwaysVisible: true, headClassName: "text-right text-slate-500 font-semibold", className: "text-right", render: (doc) => (
      <div className="flex justify-end gap-1">
        {podeAprovar(doc.status) && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" title="Aprovar NF-e" onClick={() => setAprovarId(doc.id)}>
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" title="Ver detalhes" asChild>
          <Link to="/documents/nfe/$nfeId" params={{ nfeId: doc.id }}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600" title="Baixar XML" onClick={() => handleDownloadOne(doc)}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
    ) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);


  const { visibleColumns, allColumns, isVisible, toggleVisible, moveColumn, reset, pageSize, setPageSize } = useColumnPreferences("nfe", columns);
  const visibleCols = useMemo(() => visibleColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean), [visibleColumns, columns]);
  const orderedCols = useMemo(() => allColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean), [allColumns, columns]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, pageSize, statusFilter, sortedDocs.length]);
  const pagedDocs = useMemo(() => sortedDocs.slice((page - 1) * pageSize, page * pageSize), [sortedDocs, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NF-e (Produtos)</h1>
          <p className="text-slate-500">Notas fiscais eletrônicas recebidas.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setImportFiles([]); setImportOpen(true); }}>
            <Upload className="mr-2 h-4 w-4" /> Importar XML
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
          <Button

            variant="outline"
            onClick={() => bulkXmlMut.mutate(Array.from(selectedIds))}
            disabled={selectedIds.size === 0 || bulkXmlMut.isPending}
            title={selectedIds.size === 0 ? "Selecione ao menos uma NF-e" : undefined}
          >
            {bulkXmlMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            Baixar XMLs (Lote){selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={dataInicio || dataFim ? "default" : "outline"} size="sm">
                    <Filter className="mr-2 h-4 w-4" /> Filtros
                    {(dataInicio || dataFim) && <span className="ml-1 text-xs">(1)</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Período de emissão</p>
                    <p className="text-xs text-slate-500">Filtra a coluna Emissão entre as datas.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="dt-ini" className="text-xs">De</Label>
                      <Input id="dt-ini" type="date" value={dataInicio} max={dataFim || undefined} onChange={(e) => setDataInicio(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dt-fim" className="text-xs">Até</Label>
                      <Input id="dt-fim" type="date" value={dataFim} min={dataInicio || undefined} onChange={(e) => setDataFim(e.target.value)} />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={!dataInicio && !dataFim}
                    onClick={() => { setDataInicio(""); setDataFim(""); }}
                  >
                    Limpar filtro
                  </Button>
                </PopoverContent>
              </Popover>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[210px] bg-white border-slate-200">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {NFE_STATUS_ORDER.map((st) => (
                    <SelectItem key={st} value={st}>{statusConfig(st).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <ColumnSettings columns={orderedCols} isVisible={isVisible} toggleVisible={toggleVisible} moveColumn={moveColumn} reset={reset} pageSize={pageSize} onPageSizeChange={setPageSize} />
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span>{totalIntegradas} Integradas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span>{totalPending} Pendentes de confirmação</span>
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
              <p className="text-sm mt-1">Importe um XML ou configure a integração fiscal da empresa para começar a receber notas.</p>
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
                  {visibleCols.map((c) => (
                    <TableHead
                      key={c.key}
                      className={`${c.headClassName ?? ""} ${c.sortKey ? "cursor-pointer" : ""}`}
                      onClick={c.sortKey ? () => requestSort(c.sortKey as keyof Row) : undefined}
                    >
                      <div className="flex items-center gap-1">{c.label}{c.sortKey && <ArrowUpDown className="h-3 w-3" />}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedDocs.map((doc) => (
                  <TableRow key={doc.id} className="border-slate-100 hover:bg-slate-50/80 transition-colors" data-state={selectedIds.has(doc.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(doc.id)}
                        onCheckedChange={() => toggleRow(doc.id)}
                        aria-label={`Selecionar NF-e ${doc.numero ?? doc.id}`}
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
          <div className="px-4">
            <TablePagination page={page} pageSize={pageSize} total={sortedDocs.length} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={(o) => { if (!importMut.isPending) setImportOpen(o); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Importar NF-e via XML</DialogTitle>
            <DialogDescription>
              Selecione um ou mais arquivos XML. A plataforma valida se o destinatário pertence a uma empresa cadastrada e cria fornecedores/produtos automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              type="file"
              accept=".xml,text/xml,application/xml"
              multiple
              disabled={importMut.isPending}
              onChange={(e) => setImportFiles(Array.from(e.target.files ?? []))}
            />
            {importFiles.length > 0 && (
              <div className="text-sm text-slate-600">
                {importFiles.length} arquivo(s) selecionado(s):
                <ul className="mt-1 max-h-32 overflow-auto text-xs text-slate-500 list-disc pl-5">
                  {importFiles.map((f) => <li key={f.name}>{f.name}</li>)}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)} disabled={importMut.isPending}>Cancelar</Button>
            <Button
              onClick={() => importMut.mutate(importFiles)}
              disabled={importFiles.length === 0 || importMut.isPending}
            >
              {importMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Importar {importFiles.length > 0 ? `(${importFiles.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NfeAprovacaoDialog
        documentId={aprovarId}
        open={!!aprovarId}
        onOpenChange={(o) => { if (!o) setAprovarId(null); }}
      />
    </div>
  );

}
