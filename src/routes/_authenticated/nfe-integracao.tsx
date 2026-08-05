import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Loader2,
  Download,
  FileCheck2,
  FileDown,
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TablePagination } from "@/components/common/TablePagination";
import { ColumnSettings } from "@/components/common/ColumnSettings";
import { useColumnPreferences, type ColumnDef } from "@/hooks/use-column-preferences";
import { useSortableData } from "@/hooks/use-sortable-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  baixarXml,
  listarDocumentos,
  listarHistorico,
  manifestar,
  sincronizar,
  type DocumentoFiscal,
  type TipoEventoManifestacao,
} from "@/services/apfiscalService";
import { STATUS_LABEL, TIPOS_EVENTO_MANIFESTACAO, type StatusDocumentoFiscal } from "@/lib/apfiscal/types";
import { baixarXmlUnico, baixarXmlsZip } from "@/lib/xml-zip";


export const Route = createFileRoute("/_authenticated/nfe-integracao")({
  component: NfeIntegracao,
  head: () => ({
    meta: [
      { title: "Integração de NF-e | APFiscal" },
      {
        name: "description",
        content:
          "Sincronize notas fiscais por NSU, manifeste documentos e acompanhe o histórico da integração fiscal.",
      },
      { property: "og:title", content: "Integração de NF-e | APFiscal" },
      {
        property: "og:description",
        content: "Sincronização por NSU, manifestação SEFAZ e download de XMLs no APFiscal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_STYLE: Record<StatusDocumentoFiscal, string> = {
  resumida: "bg-slate-100 text-slate-700 border-slate-200",
  manifestacao_pendente: "bg-amber-100 text-amber-800 border-amber-200",
  aguardando_xml_completo: "bg-blue-100 text-blue-800 border-blue-200",
  completa: "bg-green-100 text-green-800 border-green-200",
  erro: "bg-red-100 text-red-800 border-red-200",
};

function fmtMoeda(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR");
}

type Row = DocumentoFiscal & { data_num: number; valor_num: number };

type Col = ColumnDef & {
  sortKey?: keyof Row;
  className?: string;
  headClassName?: string;
  render: (r: Row) => ReactNode;
};

function NfeIntegracao() {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [manifestando, setManifestando] = useState(false);
  const [alvo, setAlvo] = useState<DocumentoFiscal | null>(null);
  const [tipoEvento, setTipoEvento] = useState<TipoEventoManifestacao>("210210");
  const [justificativa, setJustificativa] = useState("");
  const [filtroHist, setFiltroHist] = useState<"todos" | "sucesso" | "erro">("todos");
  const [histPage, setHistPage] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [baixandoLote, setBaixandoLote] = useState(false);


  const empresaFiltro = companyId === "todas" ? null : companyId;

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, cnpj, razao_social, nome_fantasia")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ["apfiscal-documentos", empresaFiltro],
    queryFn: () => listarDocumentos(empresaFiltro),
  });

  const { data: historico = [] } = useQuery({
    queryKey: ["apfiscal-historico", empresaFiltro, filtroHist],
    queryFn: () => listarHistorico(empresaFiltro, filtroHist),
  });

  const filtrados = useMemo<Row[]>(() => {
    const q = busca.trim().toLowerCase();
    const base = !q
      ? documentos
      : documentos.filter(
          (d) =>
            d.chave.toLowerCase().includes(q) ||
            (d.emitente_nome ?? "").toLowerCase().includes(q) ||
            (d.emitente_cnpj ?? "").includes(q),
        );
    return base.map((d) => ({
      ...d,
      data_num: d.data_emissao ? new Date(d.data_emissao).getTime() : 0,
      valor_num: Number(d.valor_nota ?? 0),
    }));
  }, [documentos, busca]);

  const { items: ordenados, requestSort } = useSortableData<Row>(filtrados);


  useEffect(() => {
    setSelecionados((prev) => {
      if (prev.size === 0) return prev;
      const visiveis = new Set(filtrados.map((d) => d.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visiveis.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [filtrados]);


  const handleSincronizar = async () => {
    if (!empresaFiltro) {
      toast.error("Selecione uma empresa para sincronizar.");
      return;
    }
    setSincronizando(true);
    try {
      const r = await sincronizar(empresaFiltro);
      toast.success(
        `${r.novosDocumentos} novas notas encontradas, ${r.xmlsResumidosBaixados} XMLs resumidos, ${r.xmlsCompletosBaixados} XMLs completos, ${r.notasImportadas} NF-e importadas.`,
      );
      if (r.erros.length) toast.warning(`${r.erros.length} ocorrência(s): ${r.erros[0].mensagem}`);
      await queryClient.invalidateQueries({ queryKey: ["apfiscal-documentos"] });
      await queryClient.invalidateQueries({ queryKey: ["apfiscal-historico"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      setSincronizando(false);
    }
  };

  const handleManifestar = async () => {
    if (!alvo) return;
    setManifestando(true);
    try {
      await manifestar({
        companyId: alvo.company_id,
        chave: alvo.chave,
        tipoEvento,
        justificativa: tipoEvento === "210240" ? justificativa.trim() : null,
      });
      toast.success("Manifestação enviada à SEFAZ.");
      setAlvo(null);
      setJustificativa("");
      await queryClient.invalidateQueries({ queryKey: ["apfiscal-documentos"] });
      await queryClient.invalidateQueries({ queryKey: ["apfiscal-historico"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao manifestar documento.");
    } finally {
      setManifestando(false);
    }
  };

  const handleBaixar = async (doc: DocumentoFiscal, tipo: "resumido" | "completo") => {
    try {
      const r = await baixarXml(doc.id, tipo);
      baixarXmlUnico(`${r.chave}-${tipo}.xml`, r.xml);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao baixar XML.");
    }
  };

  const alternarTodos = () => {
    if (todosMarcados) setSelecionados(new Set());
    else setSelecionados(new Set(paginados.map((d) => d.id)));
  };

  const alternarLinha = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBaixarLote = async () => {
    const docs = filtrados.filter((d) => selecionados.has(d.id));
    if (docs.length === 0) return;
    setBaixandoLote(true);
    try {
      const arquivos: { nome: string; conteudo: string }[] = [];
      let falhas = 0;
      for (const doc of docs) {
        const tipo: "resumido" | "completo" =
          doc.xml_completo_path ? "completo" : "resumido";
        if (!doc.xml_completo_path && !doc.xml_resumido_path) {
          falhas += 1;
          continue;
        }
        try {
          const r = await baixarXml(doc.id, tipo);
          arquivos.push({ nome: `${r.chave}-${tipo}.xml`, conteudo: r.xml });
        } catch {
          falhas += 1;
        }
      }
      if (arquivos.length === 0) {
        toast.error("Nenhum XML disponível para as notas selecionadas.");
        return;
      }
      await baixarXmlsZip(arquivos, `nfe-integracao-${new Date().toISOString().slice(0, 10)}.zip`);
      toast.success(`${arquivos.length} XML(s) compactado(s) em ZIP.`);
      if (falhas) toast.warning(`${falhas} nota(s) sem XML disponível.`);
    } finally {
      setBaixandoLote(false);
    }
  };


  const columns: Col[] = useMemo(
    () => [
      { key: "nsu", label: "NSU", sortKey: "nsu", className: "font-mono text-xs", render: (doc) => doc.nsu },
      { key: "chave", label: "Chave", sortKey: "chave", className: "font-mono text-xs", render: (doc) => doc.chave },
      {
        key: "emitente",
        label: "Emitente",
        sortKey: "emitente_nome",
        render: (doc) => (
          <>
            <div className="text-sm font-medium text-slate-800">{doc.emitente_nome ?? "—"}</div>
            <div className="text-xs text-slate-500">{doc.emitente_cnpj ?? ""}</div>
          </>
        ),
      },
      {
        key: "empresa",
        label: "Empresa",
        sortKey: "company_id",
        render: (doc) => {
          const c = companies.find((e) => e.id === doc.company_id);
          return (
            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 truncate max-w-[180px]">
              {c ? (c.nome_fantasia || c.razao_social) : "—"}
            </Badge>
          );
        }
      },
      { key: "emissao", label: "Emissão", sortKey: "data_num", className: "text-sm whitespace-nowrap", render: (doc) => fmtData(doc.data_emissao) },
      { key: "valor", label: "Valor", sortKey: "valor_num", headClassName: "text-right", className: "text-right text-sm", render: (doc) => fmtMoeda(doc.valor_nota) },
      { key: "tipo", label: "Tipo", sortKey: "tipo_documento", className: "text-sm", render: (doc) => doc.tipo_documento ?? "NF-e" },
      {
        key: "situacao",
        label: "Situação",
        sortKey: "status",
        render: (doc) =>
          doc.status === "erro" ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={STATUS_STYLE[doc.status]}>
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    {STATUS_LABEL[doc.status]}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {doc.mensagem_sefaz || "Erro sem detalhamento da SEFAZ."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge variant="outline" className={STATUS_STYLE[doc.status]}>
              {doc.status === "aguardando_xml_completo" && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              {STATUS_LABEL[doc.status]}
            </Badge>
          ),
      },
      { key: "protocolo", label: "Protocolo", sortKey: "protocolo", className: "font-mono text-xs", render: (doc) => doc.protocolo || "—" },
      { key: "atualizado", label: "Atualizado em", sortKey: "updated_at", className: "text-sm whitespace-nowrap", render: (doc) => fmtData(doc.updated_at) },
      {
        key: "actions",
        label: "Ações",
        alwaysVisible: true,
        headClassName: "text-right",
        className: "text-right",
        render: (doc) => (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAlvo(doc);
                setTipoEvento("210210");
                setJustificativa("");
              }}
            >
              <FileCheck2 className="mr-1 h-3.5 w-3.5" />
              Ciência
            </Button>
            {doc.xml_resumido_path && (
              <Button size="sm" variant="outline" onClick={() => handleBaixar(doc, "resumido")}>
                <Download className="mr-1 h-3.5 w-3.5" />
                Resumido
              </Button>
            )}
            {doc.status === "completa" && doc.xml_completo_path && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => handleBaixar(doc, "completo")}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Completo
              </Button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { visibleColumns, allColumns, isVisible, toggleVisible, moveColumn, reset, pageSize, setPageSize } =
    useColumnPreferences("nfe-integracao", columns);
  const visibleCols = useMemo(
    () => visibleColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean),
    [visibleColumns, columns],
  );
  const orderedCols = useMemo(
    () => allColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean),
    [allColumns, columns],
  );
  const colSpan = visibleCols.length + 2;

  const paginados = useMemo(
    () => ordenados.slice((page - 1) * pageSize, page * pageSize),
    [ordenados, page, pageSize],
  );
  const histPaginado = historico.slice((histPage - 1) * pageSize, histPage * pageSize);

  const todosMarcados = paginados.length > 0 && paginados.every((d) => selecionados.has(d.id));
  const algunsMarcados = selecionados.size > 0 && !todosMarcados;

  useEffect(() => {
    setPage(1);
  }, [busca, pageSize, ordenados.length]);

  const podeConfirmar =
    tipoEvento !== "210240" || justificativa.trim().length >= 15;


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Integração de NF-e</h1>
          <p className="text-sm text-slate-600">
            Sincronize documentos por NSU, manifeste eventos e baixe os XMLs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={companyId}
            onValueChange={(v) => {
              setCompanyId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as empresas</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome_fantasia || c.razao_social}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleSincronizar}
            disabled={sincronizando}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {sincronizando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar notas
          </Button>
          <Button
            variant="outline"
            onClick={handleBaixarLote}
            disabled={selecionados.size === 0 || baixandoLote}
            title={selecionados.size === 0 ? "Selecione ao menos uma NF-e" : undefined}
          >
            {baixandoLote ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            Baixar XMLs (Lote){selecionados.size > 0 ? ` (${selecionados.size})` : ""}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="documentos">
        <TabsList>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="historico">Histórico de integração</TabsTrigger>
        </TabsList>

        <TabsContent value="documentos" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Documentos fiscais</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Buscar por chave, emitente ou CNPJ"
                  className="max-w-xs"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPage(1);
                  }}
                />
                <ColumnSettings
                  columns={orderedCols}
                  isVisible={isVisible}
                  toggleVisible={toggleVisible}
                  moveColumn={moveColumn}
                  reset={reset}
                  pageSize={pageSize}
                  onPageSizeChange={setPageSize}
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={todosMarcados ? true : algunsMarcados ? "indeterminate" : false}
                        onCheckedChange={alternarTodos}
                        aria-label="Selecionar todas"
                      />
                    </TableHead>
                    <TableHead className="w-8" />
                    {visibleCols.map((c) => (
                      <TableHead
                        key={c.key}
                        className={`${c.headClassName ?? ""} ${c.sortKey ? "cursor-pointer select-none" : ""}`}
                        onClick={c.sortKey ? () => requestSort(c.sortKey as keyof Row) : undefined}
                      >
                        <div className={`flex items-center gap-1 ${c.headClassName?.includes("text-right") ? "justify-end" : ""}`}>
                          {c.label}
                          {c.sortKey && <ArrowUpDown className="h-3 w-3" />}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="py-10 text-center text-slate-500">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : paginados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="py-10 text-center text-slate-500">
                        Nenhum documento sincronizado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginados.map((doc) => (
                      <Fragment key={doc.id}>
                        <TableRow data-state={selecionados.has(doc.id) ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selecionados.has(doc.id)}
                              onCheckedChange={() => alternarLinha(doc.id)}
                              aria-label={`Selecionar NF-e ${doc.chave}`}
                            />
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => setExpandida(expandida === doc.id ? null : doc.id)}
                              aria-label="Detalhes"
                              className="text-slate-500 hover:text-slate-800"
                            >
                              {expandida === doc.id ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </TableCell>
                          {visibleCols.map((c) => (
                            <TableCell key={c.key} className={c.className}>
                              {c.render(doc)}
                            </TableCell>
                          ))}
                        </TableRow>
                        {expandida === doc.id && (
                          <TableRow className="bg-slate-50">
                            <TableCell colSpan={colSpan}>
                              <div className="grid gap-1 p-2 text-xs text-slate-600">
                                <div>
                                  <span className="font-semibold">Protocolo:</span>{" "}
                                  {doc.protocolo || "—"}
                                </div>
                                <div>
                                  <span className="font-semibold">Mensagem da SEFAZ:</span>{" "}
                                  {doc.mensagem_sefaz || "Sem mensagens."}
                                </div>
                                <div>
                                  <span className="font-semibold">Tentativas XML completo:</span>{" "}
                                  {doc.tentativas_xml_completo}
                                </div>
                                <div>
                                  <span className="font-semibold">Atualizado em:</span>{" "}
                                  {fmtData(doc.updated_at)}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))
                  )}
                </TableBody>

              </Table>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={filtrados.length}
                onPageChange={setPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Histórico de integração</CardTitle>
              <Select
                value={filtroHist}
                onValueChange={(v) => {
                  setFiltroHist(v as typeof filtroHist);
                  setHistPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="sucesso">Somente sucesso</SelectItem>
                  <SelectItem value="erro">Somente erro</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {histPaginado.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                        Nenhum registro de integração.
                      </TableCell>
                    </TableRow>
                  ) : (
                    histPaginado.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs">{fmtData(h.created_at)}</TableCell>
                        <TableCell className="text-sm">{h.acao}</TableCell>
                        <TableCell className="font-mono text-xs">{h.status_http ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              h.sucesso
                                ? "border-green-200 bg-green-100 text-green-800"
                                : "border-red-200 bg-red-100 text-red-800"
                            }
                          >
                            {h.sucesso ? "Sucesso" : "Erro"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-md truncate text-xs text-slate-600">
                          {h.mensagem ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePagination
                page={histPage}
                pageSize={pageSize}
                total={historico.length}
                onPageChange={setHistPage}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(alvo)} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manifestação do destinatário</DialogTitle>
            <DialogDescription className="font-mono text-xs">{alvo?.chave}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Tipo de evento</Label>
              <Select value={tipoEvento} onValueChange={(v) => setTipoEvento(v as TipoEventoManifestacao)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_EVENTO_MANIFESTACAO.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tipoEvento === "210240" && (
              <div className="grid gap-2">
                <Label>Justificativa (mínimo 15 caracteres)</Label>
                <Textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  maxLength={255}
                  rows={3}
                />
                <p className="text-xs text-slate-500">{justificativa.trim().length}/15 caracteres</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleManifestar}
              disabled={!podeConfirmar || manifestando}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {manifestando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar manifestação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
