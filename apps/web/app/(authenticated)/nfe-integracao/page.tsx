"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

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
  Building2,
  CheckCircle2,
  ReceiptText,
  ShieldAlert,
  Clock3,
  Send,
  FileSearch,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  manifestarEmLote,
  listarManifestacoes,
  sincronizar,
  type DocumentoFiscal,
  type TipoEventoManifestacao,
  type ResultadoManifestacaoLote,
} from "@/services/apfiscalService";
import {
  STATUS_LABEL,
  TIPOS_EVENTO_MANIFESTACAO,
  type StatusDocumentoFiscal,
} from "@/lib/apfiscal/types";
import { baixarXmlUnico, baixarXmlsZip } from "@/lib/xml-zip";
import { getFiscalSettings } from "@/services/fiscalIntegrationService";
import { Link } from "@/lib/router-compat";

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
  const [manifestacaoLote, setManifestacaoLote] = useState(false);
  const [resultadoLote, setResultadoLote] = useState<ResultadoManifestacaoLote | null>(null);

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

  const { data: manifestacoes = [] } = useQuery({
    queryKey: ["nfe-manifestacoes", empresaFiltro],
    queryFn: () => listarManifestacoes(empresaFiltro),
  });

  const manifestacoesPorChave = useMemo(() => {
    const grouped = new Map<string, typeof manifestacoes>();
    for (const event of manifestacoes) {
      const current = grouped.get(event.access_key) ?? [];
      current.push(event);
      grouped.set(event.access_key, current);
    }
    return grouped;
  }, [manifestacoes]);

  const { data: fiscalSettings, isFetching: loadingFiscalSettings } = useQuery({
    queryKey: ["fiscal-provider-settings", empresaFiltro],
    queryFn: () => getFiscalSettings(empresaFiltro!),
    enabled: Boolean(empresaFiltro),
  });

  const selectedCompany = companies.find((company) => company.id === empresaFiltro);
  const syncBlockedReason = !empresaFiltro
    ? "Selecione uma empresa específica para sincronizar."
    : loadingFiscalSettings
      ? "Verificando a configuração fiscal…"
      : !fiscalSettings?.ativo
        ? "A integração fiscal está desativada para esta empresa."
        : fiscalSettings.primary_provider === "nfewizard" && !fiscalSettings.certificateConfigured
          ? "Envie o certificado A1 da empresa antes de sincronizar."
          : null;

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
        `${r.novosDocumentos} nova(s), ${r.documentosConhecidos} conhecida(s), ${r.xmlsCompletosBaixados} XML(s) completo(s) e ${r.notasImportadas} NF-e importada(s).`,
      );
      if (r.aguardandoXmlCompleto)
        toast.info(
          `${r.aguardandoXmlCompleto} nota(s) ainda aguardam liberação do XML completo pela SEFAZ.`,
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
    const docsSelecionados = filtrados.filter((doc) => selecionados.has(doc.id));
    if (!alvo && (!manifestacaoLote || docsSelecionados.length === 0)) return;
    setManifestando(true);
    setResultadoLote(null);
    try {
      if (alvo) {
        const result = await manifestar({
          companyId: alvo.company_id,
          chave: alvo.chave,
          tipoEvento,
          justificativa: tipoEvento === "210240" ? justificativa.trim() : null,
        });
        toast.success(`${result.cStat} — ${result.xMotivo}`);
        setAlvo(null);
        setJustificativa("");
      } else {
        const groups = new Map<string, typeof docsSelecionados>();
        for (const doc of docsSelecionados) {
          const current = groups.get(doc.company_id) ?? [];
          current.push(doc);
          groups.set(doc.company_id, current);
        }
        const batches = await Promise.all(
          [...groups.entries()].map(([targetCompanyId, docs]) =>
            manifestarEmLote({
              companyId: targetCompanyId,
              chaves: docs.map((doc) => doc.chave),
              tipoEvento,
              justificativa: tipoEvento === "210240" ? justificativa.trim() : null,
            }),
          ),
        );
        const consolidated: ResultadoManifestacaoLote = {
          total: batches.reduce((sum, item) => sum + item.total, 0),
          processed: batches.reduce((sum, item) => sum + item.processed, 0),
          idempotent: batches.reduce((sum, item) => sum + item.idempotent, 0),
          failed: batches.reduce((sum, item) => sum + item.failed, 0),
          results: batches.flatMap((item) => item.results),
        };
        setResultadoLote(consolidated);
        setSelecionados(new Set());
        toast.success(`${consolidated.processed} manifestação(ões) processada(s).`);
      }
      await queryClient.invalidateQueries({ queryKey: ["apfiscal-documentos"] });
      await queryClient.invalidateQueries({ queryKey: ["nfe-manifestacoes"] });
      await queryClient.invalidateQueries({ queryKey: ["apfiscal-historico"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao manifestar documento.");
    } finally {
      setManifestando(false);
    }
  };

  const indicadores = useMemo(() => {
    let pending = 0;
    let science = 0;
    let waitingXml = 0;
    let errors = 0;
    for (const doc of documentos) {
      const events = manifestacoesPorChave.get(doc.chave) ?? [];
      const accepted = events.filter((event) => event.status === "accepted");
      if (events.some((event) => event.status === "error" || event.status === "rejected") || doc.status === "erro") errors += 1;
      if (accepted.some((event) => event.tipo === "ciencia")) science += 1;
      if (doc.status === "aguardando_xml_completo") waitingXml += 1;
      if (!accepted.some((event) => ["confirmacao", "desconhecimento", "nao_realizada"].includes(event.tipo))) pending += 1;
    }
    return { total: documentos.length, pending, science, waitingXml, errors };
  }, [documentos, manifestacoesPorChave]);

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
        const tipo: "resumido" | "completo" = doc.xml_completo_path ? "completo" : "resumido";
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
      {
        key: "numero",
        label: "NF-e",
        sortKey: "numero",
        render: (doc) => (
          <div>
            <div className="font-semibold text-slate-900">{doc.numero || "Sem número"}</div>
            <div className="text-xs text-slate-500">Série {doc.serie || "—"}</div>
          </div>
        ),
      },
      {
        key: "nsu",
        label: "NSU",
        sortKey: "nsu",
        className: "font-mono text-xs",
        render: (doc) => doc.nsu,
      },
      {
        key: "chave",
        label: "Chave",
        sortKey: "chave",
        className: "font-mono text-xs",
        render: (doc) => doc.chave,
      },
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
            <Badge
              variant="outline"
              className="bg-slate-50 text-slate-600 border-slate-200 truncate max-w-[180px]"
            >
              {c ? c.nome_fantasia || c.razao_social : "—"}
            </Badge>
          );
        },
      },
      {
        key: "emissao",
        label: "Emissão",
        sortKey: "data_num",
        className: "text-sm whitespace-nowrap",
        render: (doc) => fmtData(doc.data_emissao),
      },
      {
        key: "valor",
        label: "Valor",
        sortKey: "valor_num",
        headClassName: "text-right",
        className: "text-right text-sm",
        render: (doc) => fmtMoeda(doc.valor_nota),
      },
      {
        key: "tipo",
        label: "Tipo",
        sortKey: "tipo_documento",
        className: "text-sm",
        render: (doc) => doc.tipo_documento ?? "NF-e",
      },
      {
        key: "fiscal",
        label: "Situação fiscal",
        sortKey: "situacao",
        render: (doc) => (
          <div className="space-y-1">
            <Badge variant="outline" className="bg-slate-50">
              {doc.situacao || "Não informada"}
            </Badge>
            {doc.tipo_evento && (
              <p className="text-[11px] text-slate-500">Evento {doc.tipo_evento}</p>
            )}
          </div>
        ),
      },
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
      {
        key: "protocolo",
        label: "Protocolo",
        sortKey: "protocolo",
        className: "font-mono text-xs",
        render: (doc) => doc.protocolo || "—",
      },
      {
        key: "xml",
        label: "XML / manifestação",
        render: (doc) => (
          <div className="space-y-1 text-xs">
            <p>
              <span className="font-medium">XML:</span>{" "}
              {doc.status_download || (doc.xml_completo_path ? "Completo" : "Resumido")}
            </p>
            <p>
              <span className="font-medium">Manifestação:</span>{" "}
              {doc.status_manifestacao || "Pendente"}
            </p>
            <p className="text-slate-500">Schema {doc.schema_documento || "—"}</p>
          </div>
        ),
      },
      {
        key: "atualizado",
        label: "Última sincronização",
        sortKey: "ultima_sincronizacao",
        className: "text-sm whitespace-nowrap",
        render: (doc) => fmtData(doc.ultima_sincronizacao || doc.updated_at),
      },
      {
        key: "actions",
        label: "Ações",
        alwaysVisible: true,
        headClassName: "text-right",
        className: "text-right",
        render: (doc) => (
          <div className="flex justify-end gap-1">
            {!((manifestacoesPorChave.get(doc.chave) ?? []).some(
              (event) => event.status === "accepted" && ["confirmacao", "desconhecimento", "nao_realizada"].includes(event.tipo),
            )) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAlvo(doc);
                  setTipoEvento(
                    (manifestacoesPorChave.get(doc.chave) ?? []).some(
                      (event) => event.status === "accepted" && event.tipo === "ciencia",
                    ) ? "210200" : "210210",
                  );
                  setJustificativa("");
                }}
              >
                <FileCheck2 className="mr-1 h-3.5 w-3.5" />
                Manifestar
              </Button>
            )}
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
            {doc.fiscal_document_id && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/documents/nfe/$nfeId" params={{ nfeId: doc.fiscal_document_id }}>
                  Abrir completa
                </Link>
              </Button>
            )}
          </div>
        ),
      },
    ],
    [companies, manifestacoesPorChave],
  );

  const {
    visibleColumns,
    allColumns,
    isVisible,
    toggleVisible,
    moveColumn,
    reset,
    pageSize,
    setPageSize,
  } = useColumnPreferences("nfe-integracao", columns);
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

  const podeConfirmar = tipoEvento !== "210240" || justificativa.trim().length >= 15;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Operação fiscal
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                Central de NF-e Resumidas
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Analise resumos, registre manifestações e acompanhe a liberação do XML. Quando a NF-e fica completa, ela sai daqui automaticamente.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <Select
              value={companyId}
              onValueChange={(v) => {
                setCompanyId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full bg-white sm:w-[280px]">
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
              disabled={sincronizando || Boolean(syncBlockedReason)}
              title={syncBlockedReason ?? undefined}
              className="min-w-44"
            >
              {sincronizando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sincronizar notas
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div className="flex items-center gap-2 text-slate-700">
            {syncBlockedReason ? (
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            <span>
              {syncBlockedReason ??
                `${selectedCompany?.nome_fantasia || selectedCompany?.razao_social}: NFeWizard pronto para consultar.`}
            </span>
          </div>
          {fiscalSettings?.checkpoint && (
            <span className="text-xs text-slate-500">
              Último NSU:{" "}
              <span className="font-mono font-medium text-slate-700">
                {fiscalSettings.checkpoint.last_nsu}
              </span>
            </span>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Resumo das NF-e resumidas">
        {[
          { label: "Resumos ativos", value: indicadores.total, icon: ReceiptText, tone: "text-slate-700 bg-slate-100" },
          { label: "Aguardando ação", value: indicadores.pending, icon: Clock3, tone: "text-amber-700 bg-amber-100" },
          { label: "Ciência registrada", value: indicadores.science, icon: FileCheck2, tone: "text-blue-700 bg-blue-100" },
          { label: "Aguardando XML", value: indicadores.waitingXml, icon: FileSearch, tone: "text-indigo-700 bg-indigo-100" },
          { label: "Com ocorrência", value: indicadores.errors, icon: AlertTriangle, tone: "text-red-700 bg-red-100" },
        ].map((item) => (
          <Card key={item.label} className="shadow-none">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.tone}`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight text-slate-950">{item.value}</p>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Tabs defaultValue="documentos">
        <TabsList>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="historico">Histórico de integração</TabsTrigger>
        </TabsList>

        <TabsContent value="documentos" className="mt-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Resumos em acompanhamento</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {filtrados.length} documento(s) no filtro atual
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Input
                  placeholder="Buscar por chave, emitente ou CNPJ"
                  className="w-full sm:w-72"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPage(1);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    setManifestacaoLote(true);
                    setResultadoLote(null);
                    setTipoEvento("210210");
                    setJustificativa("");
                  }}
                  disabled={selecionados.size === 0}
                  title={selecionados.size === 0 ? "Selecione ao menos uma NF-e resumida" : undefined}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Manifestar{selecionados.size > 0 ? ` (${selecionados.size})` : ""}
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
                  Baixar XML{selecionados.size > 0 ? ` (${selecionados.size})` : ""}
                </Button>
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
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[960px]">
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
                        <div
                          className={`flex items-center gap-1 ${c.headClassName?.includes("text-right") ? "justify-end" : ""}`}
                        >
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
                      <TableCell colSpan={colSpan} className="py-16 text-center text-slate-500">
                        <Building2 className="mx-auto mb-3 h-7 w-7 text-slate-300" />
                        <p className="font-medium text-slate-700">Nenhum documento encontrado</p>
                        <p className="mt-1 text-xs">
                          Selecione uma empresa pronta e execute a primeira sincronização.
                        </p>
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
                                  <span className="font-semibold">Recebida em:</span>{" "}
                                  {fmtData(doc.data_recebimento)}
                                </div>
                                <div>
                                  <span className="font-semibold">Atualizado em:</span>{" "}
                                  {fmtData(doc.updated_at)}
                                </div>
                                <div className="mt-2 border-t border-slate-200 pt-2">
                                  <span className="font-semibold">Linha do tempo:</span>
                                  {(manifestacoesPorChave.get(doc.chave) ?? []).length === 0 ? (
                                    <p className="mt-1 text-slate-500">Resumo recebido. Aguardando análise.</p>
                                  ) : (
                                    <div className="mt-2 space-y-2">
                                      {(manifestacoesPorChave.get(doc.chave) ?? []).map((event) => (
                                        <div key={event.id} className="flex gap-2 rounded-md border border-slate-200 bg-white p-2">
                                          <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.status === "accepted" ? "bg-emerald-500" : event.status === "requested" ? "bg-amber-500" : "bg-red-500"}`} />
                                          <div>
                                            <p className="font-medium text-slate-800">{event.descricao_evento ?? event.tipo}</p>
                                            <p className="text-slate-500">
                                              {fmtData(event.event_at ?? event.requested_at)}
                                              {event.response_cstat ? ` · cStat ${event.response_cstat}` : ""}
                                              {event.protocolo ? ` · Protocolo ${event.protocolo}` : ""}
                                            </p>
                                            {event.response_xmotivo && <p className="text-slate-600">{event.response_xmotivo}</p>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
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

      <Dialog
        open={Boolean(alvo) || manifestacaoLote}
        onOpenChange={(open) => {
          if (!open) {
            setAlvo(null);
            setManifestacaoLote(false);
            setResultadoLote(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manifestação do destinatário</DialogTitle>
            <DialogDescription className={alvo ? "font-mono text-xs" : undefined}>
              {alvo?.chave ?? `${selecionados.size} NF-e selecionada(s), com resultado individual por chave.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Tipo de evento</Label>
              <Select
                value={tipoEvento}
                onValueChange={(v) => setTipoEvento(v as TipoEventoManifestacao)}
              >
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
                <p className="text-xs text-slate-500">
                  {justificativa.trim().length}/15 caracteres
                </p>
              </div>
            )}
            {resultadoLote && (
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">
                  {resultadoLote.processed} processada(s), {resultadoLote.idempotent} já registrada(s) e {resultadoLote.failed} com falha
                </p>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                  {resultadoLote.results.map((result) => (
                    <div key={result.accessKey} className="rounded-md bg-white p-2 text-xs shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono" title={result.accessKey}>{result.accessKey}</span>
                        <Badge variant="outline" className={result.success && result.accepted !== false ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>
                          {result.success && result.accepted !== false ? "Processada" : "Falha"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-slate-600">{result.cStat ? `${result.cStat} — ` : ""}{result.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAlvo(null);
              setManifestacaoLote(false);
              setResultadoLote(null);
            }}>
              {resultadoLote ? "Fechar" : "Cancelar"}
            </Button>
            {!resultadoLote && <Button
              onClick={handleManifestar}
              disabled={!podeConfirmar || manifestando}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {manifestando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar manifestação
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default NfeIntegracao;
