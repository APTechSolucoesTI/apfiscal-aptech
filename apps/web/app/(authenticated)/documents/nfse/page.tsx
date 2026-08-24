"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpDown,
  Building2,
  Download,
  Eye,
  FileArchive,
  FileCheck2,
  FileSpreadsheet,
  FilterX,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FiscalStatusBadge, TotvsStatusBadge } from "@/components/fiscal/FiscalStatusBadge";
import { TablePagination } from "@/components/common/TablePagination";
import { useSortableData } from "@/hooks/use-sortable-data";
import { baixarXmlUnico, baixarXmlsZip } from "@/lib/xml-zip";
import { maskCnpjCpf } from "@/lib/br-format";
import {
  getFiscalXml,
  importNfseXml,
  listNfse,
  type NfseListItem,
} from "@/services/fiscalDocumentsService";
import { enqueueNfseSync } from "@/services/totvsService";
import { useServerFn } from "@/lib/api-action";
import { deleteFiscalDocuments } from "@/lib/client-actions";

type Row = NfseListItem & { emissionTime: number; totalValue: number; companyName: string };
const money = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function downloadCsv(rows: Row[]) {
  const header = [
    "Empresa",
    "Numero",
    "Serie",
    "Emissao",
    "Competencia",
    "Prestador",
    "CNPJ prestador",
    "Tomador",
    "Municipio",
    "Valor bruto",
    "Valor liquido",
    "ISS",
    "Status",
    "TOTVS",
    "Chave",
  ];
  const content = [
    header,
    ...rows.map((row) => [
      row.companyName,
      row.numero,
      row.serie,
      row.data_emissao,
      row.competence_date,
      row.emitente_nome,
      row.emitente_cnpj,
      row.destinatario_nome,
      row.service_municipality_name,
      row.service_gross_value,
      row.service_net_value,
      row.iss_value,
      row.sync_status,
      row.totvs?.status ?? "nao_iniciada",
      row.chave_acesso,
    ]),
  ]
    .map((line) => line.map(csvCell).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `nfse-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function NfsePage() {
  const queryClient = useQueryClient();
  const removeMany = useServerFn(deleteFiscalDocuments);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [status, setStatus] = useState("all");
  const [totvsStatus, setTotvsStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [importOpen, setImportOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const documents = useQuery({ queryKey: ["nfse-documents"], queryFn: listNfse });
  const companies = useQuery({
    queryKey: ["companies-min"],
    queryFn: async () => {
      const result = await supabase
        .from("companies")
        .select("id, razao_social, nome_fantasia")
        .order("razao_social");
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  const rows = useMemo<Row[]>(() => {
    const query = search.trim().toLowerCase();
    const start = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const end = to ? new Date(`${to}T23:59:59`).getTime() : null;
    return (documents.data ?? [])
      .filter((item) => {
        const emission = item.data_emissao ? new Date(item.data_emissao).getTime() : 0;
        const searchable = [
          item.numero,
          item.serie,
          item.chave_acesso,
          item.emitente_cnpj,
          item.emitente_nome,
          item.destinatario_cnpj,
          item.destinatario_nome,
          item.service_municipality_name,
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!query || searchable.includes(query)) &&
          (companyId === "all" || item.company_id === companyId) &&
          (status === "all" || item.sync_status === status) &&
          (totvsStatus === "all" ||
            (totvsStatus === "not_started" ? !item.totvs : item.totvs?.status === totvsStatus)) &&
          (!start || emission >= start) &&
          (!end || emission <= end)
        );
      })
      .map((item) => ({
        ...item,
        emissionTime: item.data_emissao ? new Date(item.data_emissao).getTime() : 0,
        totalValue: Number(item.service_net_value ?? item.valor_total ?? 0),
        companyName: item.companies?.nome_fantasia || item.companies?.razao_social || "Empresa",
      }));
  }, [documents.data, search, companyId, status, totvsStatus, from, to]);
  const sorted = useSortableData(rows);
  const paged = sorted.items.slice((page - 1) * pageSize, page * pageSize);
  const allSelected = paged.length > 0 && paged.every((item) => selected.has(item.id));
  const partiallySelected = selected.size > 0 && !allSelected;
  useEffect(() => setPage(1), [search, companyId, status, totvsStatus, from, to, pageSize]);
  useEffect(
    () =>
      setSelected(
        (current) => new Set([...current].filter((id) => rows.some((row) => row.id === id))),
      ),
    [rows],
  );

  const importMutation = useMutation({
    mutationFn: async (files: File[]) => Promise.all(files.map((file) => importNfseXml(file))),
    onSuccess: (results) => {
      const duplicated = results.filter((result) => result.duplicated).length;
      toast.success(`${results.length - duplicated} NFS-e importada(s).`);
      if (duplicated) toast.info(`${duplicated} NFS-e existente(s) foram reprocessadas.`);
      setImportFiles([]);
      setImportOpen(false);
      queryClient.invalidateQueries({ queryKey: ["nfse-documents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const syncMutation = useMutation({
    mutationFn: (id: string) => enqueueNfseSync(id),
    onSuccess: () => {
      toast.success("Sincronização NFS-e enviada para fila.");
      queryClient.invalidateQueries({ queryKey: ["nfse-documents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const xmlMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const downloads = await Promise.allSettled(ids.map(getFiscalXml));
      const files = downloads
        .filter(
          (result): result is PromiseFulfilledResult<{ filename: string; xml: string }> =>
            result.status === "fulfilled",
        )
        .map((result) => ({ nome: result.value.filename, conteudo: result.value.xml }));
      if (!files.length) throw new Error("Nenhuma NFS-e selecionada possui XML disponível.");
      await baixarXmlsZip(files, `nfse-xml-${new Date().toISOString().slice(0, 10)}.zip`);
      return { success: files.length, failed: ids.length - files.length };
    },
    onSuccess: ({ success, failed }) => {
      toast.success(`${success} XML(s) baixados.`);
      if (failed) toast.warning(`${failed} documento(s) sem XML disponível.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => removeMany({ data: { ids } }),
    onSuccess: () => {
      toast.success("NFS-e excluídas.");
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["nfse-documents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteSelected = () => {
    if (
      !selected.size ||
      !confirm(`Excluir ${selected.size} NFS-e selecionada(s)? Esta ação não pode ser desfeita.`)
    )
      return;
    deleteMutation.mutate([...selected]);
  };
  const clearFilters = () => {
    setSearch("");
    setCompanyId("all");
    setStatus("all");
    setTotvsStatus("all");
    setFrom("");
    setTo("");
  };
  const activeFilters = [
    search,
    companyId !== "all",
    status !== "all",
    totvsStatus !== "all",
    from,
    to,
  ].filter(Boolean).length;
  const totalValue = rows.reduce((sum, item) => sum + item.totalValue, 0);
  const errors = rows.filter(
    (item) => item.sync_status === "error" || item.processing_error,
  ).length;
  const pendingTotvs = rows.filter(
    (item) => !item.totvs || !["completed", "success"].includes(item.totvs.status),
  ).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Documentos fiscais
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">NFS-e</h1>
          <p className="mt-1 text-sm text-slate-600">
            Serviços tomados, XML, situação fiscal e preparação para TOTVS no mesmo fluxo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 && (
            <Button
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={deleteSelected}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Excluir ({selected.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => downloadCsv(rows)} disabled={!rows.length}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => xmlMutation.mutate([...selected])}
            disabled={!selected.size || xmlMutation.isPending}
          >
            {xmlMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileArchive className="mr-2 h-4 w-4" />
            )}
            Baixar XMLs{selected.size ? ` (${selected.size})` : ""}
          </Button>
          <Button
            variant="outline"
            onClick={() => companyId !== "all" && syncMutation.mutate(companyId)}
            disabled={companyId === "all" || syncMutation.isPending}
            title={companyId === "all" ? "Selecione uma empresa para sincronizar" : undefined}
          >
            {syncMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar
          </Button>
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar XML
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo das NFS-e">
        {[
          {
            label: "Documentos no filtro",
            value: rows.length.toLocaleString("pt-BR"),
            detail: `${(documents.data ?? []).length} no total`,
            icon: FileCheck2,
            tone: "text-blue-700 bg-blue-50",
          },
          {
            label: "Valor líquido",
            value: money(totalValue),
            detail: "Somatório do filtro atual",
            icon: WalletCards,
            tone: "text-emerald-700 bg-emerald-50",
          },
          {
            label: "Pendentes no TOTVS",
            value: pendingTotvs.toLocaleString("pt-BR"),
            detail: "Escrita permanece bloqueada",
            icon: Building2,
            tone: "text-amber-700 bg-amber-50",
          },
          {
            label: "Exigem atenção",
            value: errors.toLocaleString("pt-BR"),
            detail: errors ? "Revise erros de processamento" : "Nenhum erro no filtro",
            icon: AlertCircle,
            tone: errors ? "text-red-700 bg-red-50" : "text-slate-600 bg-slate-50",
          },
        ].map((item) => (
          <Card key={item.label} className="border-slate-200 shadow-none">
            <CardContent className="flex items-start gap-3 p-4">
              <div className={`rounded-lg p-2 ${item.tone}`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
                  {item.value}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{item.detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/70 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_170px_170px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Número, prestador, tomador, CPF/CNPJ ou chave"
                className="bg-white pl-9"
              />
            </div>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {(companies.data ?? []).map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.nome_fantasia || company.razao_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                <SelectItem value="processed">Processadas</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
                <SelectItem value="replaced">Substituídas</SelectItem>
                <SelectItem value="error">Com erro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={totvsStatus} onValueChange={setTotvsStatus}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="TOTVS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos no TOTVS</SelectItem>
                <SelectItem value="not_started">Não iniciadas</SelectItem>
                <SelectItem value="blocked">Bloqueadas</SelectItem>
                <SelectItem value="failed">Com erro</SelectItem>
                <SelectItem value="completed">Integradas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="nfse-from" className="mb-1 block text-xs text-slate-500">
                  Emissão de
                </Label>
                <Input
                  id="nfse-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => setFrom(event.target.value)}
                  className="bg-white"
                />
              </div>
              <div>
                <Label htmlFor="nfse-to" className="mb-1 block text-xs text-slate-500">
                  Até
                </Label>
                <Input
                  id="nfse-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => setTo(event.target.value)}
                  className="bg-white"
                />
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!activeFilters}>
              <FilterX className="mr-2 h-4 w-4" />
              Limpar filtros{activeFilters ? ` (${activeFilters})` : ""}
            </Button>
            <div className="sm:ml-auto">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => setPageSize(Number(value))}
              >
                <SelectTrigger className="w-36 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} por página
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {documents.isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-3 p-4">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))
          ) : documents.isError ? (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto h-7 w-7 text-red-500" />
              <p className="mt-2 font-medium">Falha ao carregar NFS-e</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => documents.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : !paged.length ? (
            <div className="p-10 text-center text-sm text-slate-500">Nenhuma NFS-e encontrada.</div>
          ) : (
            paged.map((item) => (
              <article key={item.id} className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                        return next;
                      })
                    }
                    aria-label={`Selecionar NFS-e ${item.numero}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          to="/documents/nfse/$nfseId"
                          params={{ nfseId: item.id }}
                          className="font-semibold text-primary"
                        >
                          NFS-e {item.numero}
                        </Link>
                        <p className="text-xs text-slate-500">
                          Série {item.serie || "—"} · {date(item.data_emissao)}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums text-slate-950">
                        {money(item.service_net_value ?? item.valor_total)}
                      </p>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-slate-900">
                      {item.emitente_nome || "Prestador não informado"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.service_municipality_name || "Município não informado"} · competência{" "}
                      {date(item.competence_date)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-8">
                  <FiscalStatusBadge status={item.sync_status} />
                  <TotvsStatusBadge status={item.totvs?.status} />
                  <Button variant="outline" size="sm" className="ml-auto" asChild>
                    <Link to="/documents/nfse/$nfseId" params={{ nfseId: item.id }}>
                      <Eye className="mr-2 h-4 w-4" />
                      Abrir
                    </Link>
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table className="min-w-[1320px]">
            <TableHeader>
              <TableRow className="bg-white hover:bg-white">
                <TableHead className="w-11">
                  <Checkbox
                    checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                    onCheckedChange={() =>
                      setSelected(allSelected ? new Set() : new Set(paged.map((item) => item.id)))
                    }
                    aria-label="Selecionar NFS-e visíveis"
                  />
                </TableHead>
                {[
                  ["numero", "NFS-e"],
                  ["emissionTime", "Emissão / competência"],
                  ["emitente_nome", "Prestador"],
                  ["companyName", "Tomador / empresa"],
                  ["service_municipality_name", "Município"],
                  ["totalValue", "Valores"],
                  ["sync_status", "Situação"],
                  ["totvs", "TOTVS"],
                ].map(([key, label]) => (
                  <TableHead
                    key={key}
                    onClick={() => sorted.requestSort(key as keyof Row)}
                    className="cursor-pointer select-none"
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <ArrowUpDown className="h-3 w-3 text-slate-400" />
                    </span>
                  </TableHead>
                ))}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 10 }).map((__, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : documents.isError ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-16 text-center">
                    <AlertCircle className="mx-auto h-7 w-7 text-red-500" />
                    <p className="mt-3 font-medium text-slate-900">Falha ao carregar NFS-e</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {(documents.error as Error).message}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => documents.refetch()}
                    >
                      Tentar novamente
                    </Button>
                  </TableCell>
                </TableRow>
              ) : !paged.length ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-16 text-center">
                    <FileCheck2 className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-800">Nenhuma NFS-e encontrada</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Ajuste filtros, importe XML ou sincronize empresa selecionada.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((item) => (
                  <TableRow
                    key={item.id}
                    data-state={selected.has(item.id) ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                            return next;
                          })
                        }
                        aria-label={`Selecionar NFS-e ${item.numero}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/documents/nfse/$nfseId"
                        params={{ nfseId: item.id }}
                        className="font-semibold text-primary hover:underline"
                      >
                        {item.numero || "Sem número"}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-slate-500">Série {item.serie || "—"}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-slate-800">
                        {date(item.data_emissao)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Competência {date(item.competence_date)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p
                        className="max-w-[220px] truncate text-sm font-medium text-slate-900"
                        title={item.emitente_nome ?? undefined}
                      >
                        {item.emitente_nome || "Não informado"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.emitente_cnpj
                          ? maskCnpjCpf(item.emitente_cnpj)
                          : "CPF/CNPJ não informado"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[190px] truncate text-sm font-medium text-slate-800">
                        {item.companyName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.destinatario_cnpj ? maskCnpjCpf(item.destinatario_cnpj) : "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        {item.service_municipality_name || "Não informado"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="font-semibold tabular-nums text-slate-900">
                        {money(item.service_net_value ?? item.valor_total)}
                      </p>
                      <p className="text-[11px] tabular-nums text-slate-500">
                        Bruto {money(item.service_gross_value ?? item.valor_total)} · ISS{" "}
                        {money(item.iss_value)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <FiscalStatusBadge status={item.sync_status} />
                        {item.xml_available ? (
                          <Badge
                            variant="outline"
                            className="block w-fit border-blue-200 bg-blue-50 text-blue-700"
                          >
                            XML disponível
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="block w-fit text-slate-500">
                            Sem XML
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <TotvsStatusBadge status={item.totvs?.status} />
                      {item.totvs?.error_message && (
                        <p
                          className="mt-1 max-w-[170px] truncate text-[11px] text-red-600"
                          title={item.totvs.error_message}
                        >
                          {item.totvs.error_message}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Abrir NFS-e ${item.numero}`}
                          asChild
                        >
                          <Link to="/documents/nfse/$nfseId" params={{ nfseId: item.id }}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Baixar XML da NFS-e ${item.numero}`}
                          disabled={!item.xml_available}
                          onClick={async () => {
                            try {
                              const result = await getFiscalXml(item.id);
                              baixarXmlUnico(result.filename, result.xml);
                            } catch (error) {
                              toast.error(
                                error instanceof Error ? error.message : "Falha ao baixar XML.",
                              );
                            }
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3">
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={rows.length}
            onPageChange={setPage}
          />
        </div>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar XML de NFS-e</DialogTitle>
            <DialogDescription>
              Tomador do XML precisa corresponder a uma empresa acessível. Arquivos existentes serão
              reprocessados sem duplicidade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nfse-xml">Arquivos XML</Label>
            <Input
              id="nfse-xml"
              type="file"
              accept=".xml,text/xml,application/xml"
              multiple
              onChange={(event) => setImportFiles(Array.from(event.target.files ?? []))}
            />
            <p className="text-xs text-slate-500">
              {importFiles.length
                ? `${importFiles.length} arquivo(s) selecionado(s)`
                : "Nenhum arquivo selecionado."}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => importMutation.mutate(importFiles)}
              disabled={!importFiles.length || importMutation.isPending}
            >
              {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
