import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/monitoring")({
  component: MonitoringPage,
  head: () => ({
    meta: [
      { title: "Monitoramento Fiscal | APFiscal" },
      {
        name: "description",
        content:
          "Acompanhe a busca automática de NF-e por CNPJ, dispare buscas manuais e visualize o histórico de sincronizações com a SEFAZ.",
      },
      { property: "og:title", content: "Monitoramento Fiscal | APFiscal" },
      {
        property: "og:description",
        content:
          "Status em tempo real das sincronizações SEFAZ por CNPJ no APFiscal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

// ---------- Types ----------
type Ambiente = "producao" | "homologacao";
type SincStatus = "pendente" | "em_andamento" | "concluida" | "erro";
type JobStatus = "solicitado" | "processando" | "concluido" | "erro";

type Empresa = {
  id: string;
  cnpj: string;
  razao_social: string;
  uf: string;
  ambiente: Ambiente;
  certificado_valido_ate: string; // ISO date
  ultimo_nsu: string;
  ativo: boolean;
  ultima_sincronizacao?: string;
  novidades_desde_ultima_visita: number;
};

type Sincronizacao = {
  id: string;
  empresa_id: string;
  status: SincStatus;
  iniciado_em: string;
  finalizado_em?: string;
  documentos_novos: number;
  mensagem_erro?: string;
  origem: "agendada" | "manual";
};

// ---------- Mock data ----------
const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

const EMPRESAS_MOCK: Empresa[] = [
  {
    id: "e1",
    cnpj: "12.345.678/0001-90",
    razao_social: "APFiscal Comércio Ltda",
    uf: "SP",
    ambiente: "producao",
    certificado_valido_ate: iso(1000 * 60 * 60 * 24 * 240),
    ultimo_nsu: "000000000123456",
    ativo: true,
    ultima_sincronizacao: iso(-1000 * 60 * 8),
    novidades_desde_ultima_visita: 4,
  },
  {
    id: "e2",
    cnpj: "98.765.432/0001-10",
    razao_social: "Indústria Norte S/A",
    uf: "PR",
    ambiente: "producao",
    certificado_valido_ate: iso(1000 * 60 * 60 * 24 * 12),
    ultimo_nsu: "000000000098765",
    ativo: true,
    ultima_sincronizacao: iso(-1000 * 60 * 60 * 2),
    novidades_desde_ultima_visita: 0,
  },
  {
    id: "e3",
    cnpj: "11.222.333/0001-44",
    razao_social: "Homolog Testes ME",
    uf: "MG",
    ambiente: "homologacao",
    certificado_valido_ate: iso(-1000 * 60 * 60 * 24 * 3),
    ultimo_nsu: "000000000000001",
    ativo: false,
    novidades_desde_ultima_visita: 0,
  },
];

const SINCS_MOCK: Record<string, Sincronizacao[]> = {
  e1: [
    {
      id: "s1",
      empresa_id: "e1",
      status: "concluida",
      iniciado_em: iso(-1000 * 60 * 8),
      finalizado_em: iso(-1000 * 60 * 7),
      documentos_novos: 4,
      origem: "agendada",
    },
    {
      id: "s2",
      empresa_id: "e1",
      status: "concluida",
      iniciado_em: iso(-1000 * 60 * 60),
      finalizado_em: iso(-1000 * 60 * 59),
      documentos_novos: 0,
      origem: "agendada",
    },
    {
      id: "s3",
      empresa_id: "e1",
      status: "erro",
      iniciado_em: iso(-1000 * 60 * 60 * 3),
      finalizado_em: iso(-1000 * 60 * 60 * 3 + 20_000),
      documentos_novos: 0,
      mensagem_erro:
        "Timeout ao consultar o web service da SEFAZ-SP (NfeDistribuicaoDFe).",
      origem: "manual",
    },
    {
      id: "s4",
      empresa_id: "e1",
      status: "concluida",
      iniciado_em: iso(-1000 * 60 * 60 * 8),
      finalizado_em: iso(-1000 * 60 * 60 * 8 + 45_000),
      documentos_novos: 12,
      origem: "agendada",
    },
  ],
  e2: [
    {
      id: "s5",
      empresa_id: "e2",
      status: "em_andamento",
      iniciado_em: iso(-1000 * 45),
      documentos_novos: 0,
      origem: "agendada",
    },
    {
      id: "s6",
      empresa_id: "e2",
      status: "concluida",
      iniciado_em: iso(-1000 * 60 * 60 * 2),
      finalizado_em: iso(-1000 * 60 * 60 * 2 + 30_000),
      documentos_novos: 2,
      origem: "agendada",
    },
  ],
  e3: [],
};

// ---------- Helpers ----------
function formatRelative(dateISO?: string) {
  if (!dateISO) return "—";
  const diff = Date.now() - new Date(dateISO).getTime();
  const abs = Math.abs(diff);
  const min = Math.floor(abs / 60_000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  if (h < 24) return `há ${h} h`;
  return `há ${d} d`;
}

function formatFull(dateISO?: string) {
  if (!dateISO) return "";
  return new Date(dateISO).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function formatDate(dateISO: string) {
  return new Date(dateISO).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function daysUntil(dateISO: string) {
  return Math.ceil((new Date(dateISO).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function durationLabel(start: string, end?: string) {
  if (!end) return "em andamento";
  const s = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  if (s < 60) return `${Math.max(1, Math.round(s))}s`;
  return `${Math.round(s / 60)}min`;
}

// ---------- Component ----------
function MonitoringPage() {
  const [loading, setLoading] = useState(true);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [sincs, setSincs] = useState<Record<string, Sincronizacao[]>>({});
  const [selectedId, setSelectedId] = useState<string>("e1");
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [lastManualAt, setLastManualAt] = useState<number | null>(null);
  const [rateLeft, setRateLeft] = useState(0);
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);

  // simulate initial load
  useEffect(() => {
    const t = setTimeout(() => {
      setEmpresas(EMPRESAS_MOCK);
      setSincs(SINCS_MOCK);
      setLoading(false);
    }, 500);
    return () => clearTimeout(t);
  }, []);

  // rate limit ticker
  useEffect(() => {
    if (!lastManualAt) return;
    const iv = setInterval(() => {
      const left = 60 - Math.floor((Date.now() - lastManualAt) / 1000);
      setRateLeft(left > 0 ? left : 0);
      if (left <= 0) clearInterval(iv);
    }, 500);
    return () => clearInterval(iv);
  }, [lastManualAt]);

  const empresa = useMemo(
    () => empresas.find((e) => e.id === selectedId),
    [empresas, selectedId],
  );
  const historico = useMemo(
    () =>
      (sincs[selectedId] ?? []).slice().sort(
        (a, b) => new Date(b.iniciado_em).getTime() - new Date(a.iniciado_em).getTime(),
      ),
    [sincs, selectedId],
  );

  const certDias = empresa ? daysUntil(empresa.certificado_valido_ate) : 0;
  const certVencido = certDias < 0;
  const certProximo = certDias >= 0 && certDias < 30;
  const buscando = jobStatus === "solicitado" || jobStatus === "processando";
  const rateLimited = rateLeft > 0;

  const handleBuscar = () => {
    if (!empresa || certVencido || buscando || rateLimited) return;
    setJobStatus("solicitado");
    // simulate worker processing
    setTimeout(() => setJobStatus("processando"), 800);
    setTimeout(() => {
      const novos = Math.floor(Math.random() * 6);
      const success = Math.random() > 0.15;
      if (success) {
        setJobStatus("concluido");
        const nova: Sincronizacao = {
          id: `s-${Date.now()}`,
          empresa_id: empresa.id,
          status: "concluida",
          iniciado_em: iso(-2500),
          finalizado_em: new Date().toISOString(),
          documentos_novos: novos,
          origem: "manual",
        };
        setSincs((prev) => ({
          ...prev,
          [empresa.id]: [nova, ...(prev[empresa.id] ?? [])],
        }));
        setEmpresas((prev) =>
          prev.map((e) =>
            e.id === empresa.id
              ? {
                  ...e,
                  ultima_sincronizacao: nova.finalizado_em,
                  novidades_desde_ultima_visita:
                    e.novidades_desde_ultima_visita + novos,
                }
              : e,
          ),
        );
        toast.success(
          novos > 0
            ? `Busca concluída — ${novos} nova(s) nota(s) encontrada(s)`
            : "Busca concluída — nenhuma novidade",
        );
      } else {
        setJobStatus("erro");
        const err: Sincronizacao = {
          id: `s-${Date.now()}`,
          empresa_id: empresa.id,
          status: "erro",
          iniciado_em: iso(-2500),
          finalizado_em: new Date().toISOString(),
          documentos_novos: 0,
          mensagem_erro: "Falha na comunicação com o web service da SEFAZ.",
          origem: "manual",
        };
        setSincs((prev) => ({
          ...prev,
          [empresa.id]: [err, ...(prev[empresa.id] ?? [])],
        }));
        toast.error("Erro na busca — " + err.mensagem_erro, {
          action: {
            label: "Tentar novamente",
            onClick: () => handleBuscar(),
          },
        });
      }
      setLastManualAt(Date.now());
      setRateLeft(60);
      setTimeout(() => setJobStatus(null), 2000);
    }, 2500);
  };

  const toggleMonitoramento = (checked: boolean) => {
    if (!empresa) return;
    if (!checked) {
      setConfirmToggleOpen(true);
      return;
    }
    setEmpresas((prev) =>
      prev.map((e) => (e.id === empresa.id ? { ...e, ativo: true } : e)),
    );
    toast.success("Monitoramento automático reativado");
  };

  const confirmDisable = () => {
    if (!empresa) return;
    setEmpresas((prev) =>
      prev.map((e) => (e.id === empresa.id ? { ...e, ativo: false } : e)),
    );
    setConfirmToggleOpen(false);
    toast.message("Monitoramento automático desativado para este CNPJ");
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!empresa) return null;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" />
            Monitoramento Fiscal
          </h1>
          <p className="text-slate-500 mt-1">
            Status da busca automática de NF-e por CNPJ na SEFAZ.
          </p>
        </div>
        <div className="w-full md:w-80">
          <Label className="text-xs text-slate-500">Empresa / CNPJ</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.razao_social} — {e.cnpj}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Status card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <CardTitle className="text-xl">{empresa.razao_social}</CardTitle>
              <CardDescription className="mt-1 font-mono">
                {empresa.cnpj} · {empresa.uf}
              </CardDescription>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1",
                    certVencido
                      ? "bg-red-50 text-red-700 border-red-200"
                      : certProximo
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-green-50 text-green-700 border-green-200",
                  )}
                >
                  {certVencido ? (
                    <ShieldX className="h-3 w-3" />
                  ) : certProximo ? (
                    <ShieldAlert className="h-3 w-3" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  {certVencido
                    ? "Certificado vencido"
                    : certProximo
                      ? `Vence em ${certDias} dias`
                      : `Válido até ${formatDate(empresa.certificado_valido_ate)}`}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    empresa.ambiente === "producao"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-slate-100 text-slate-700 border-slate-200"
                  }
                >
                  {empresa.ambiente === "producao" ? "Produção" : "Homologação"}
                </Badge>
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                  <Clock className="h-3 w-3 mr-1" />
                  Última busca: <span className="ml-1" title={formatFull(empresa.ultima_sincronizacao)}>
                    {formatRelative(empresa.ultima_sincronizacao)}
                  </span>
                </Badge>
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-mono text-[10px]">
                  NSU {empresa.ultimo_nsu}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={empresa.ativo}
                  onCheckedChange={toggleMonitoramento}
                  id="mon-toggle"
                />
                <Label htmlFor="mon-toggle" className="text-sm">
                  Monitoramento ativo
                </Label>
              </div>
              <Button
                size="lg"
                onClick={handleBuscar}
                disabled={certVencido || buscando || rateLimited}
                className="gap-2 min-w-[220px]"
                title={
                  certVencido
                    ? "Renove o certificado para buscar"
                    : rateLimited
                      ? `Aguarde ${rateLeft}s para buscar novamente`
                      : undefined
                }
              >
                {buscando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando novas notas...
                  </>
                ) : rateLimited ? (
                  <>
                    <Clock className="h-4 w-4" />
                    Aguarde {rateLeft}s
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Buscar agora
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        {certVencido && (
          <CardContent>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">
                  Certificado digital vencido
                </p>
                <p className="text-sm text-red-700 mt-1">
                  A busca automática está pausada. Renove o certificado A1 para
                  retomar o monitoramento.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/settings/certificates">Renovar certificado</Link>
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Novidades */}
      <Card
        className={cn(
          "border-l-4",
          empresa.novidades_desde_ultima_visita > 0
            ? "border-l-primary bg-blue-50/30"
            : "border-l-slate-200",
        )}
      >
        <CardContent className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center",
                empresa.novidades_desde_ultima_visita > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                {empresa.novidades_desde_ultima_visita > 0
                  ? `${empresa.novidades_desde_ultima_visita} nova(s) nota(s) desde sua última visita`
                  : "Nenhuma novidade desde sua última visita"}
              </p>
              <p className="text-sm text-slate-500">
                Somente NF-e recebidas após seu último acesso.
              </p>
            </div>
          </div>
          {empresa.novidades_desde_ultima_visita > 0 && (
            <Button asChild variant="default">
              <Link to="/documents/nfe">Ver novas NF-e</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Histórico de sincronizações</CardTitle>
          <CardDescription>
            Execuções mais recentes primeiro. Origem automática (agendada pelo
            worker) ou manual (disparada por você).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
              <Activity className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">
                Esta empresa ainda não foi sincronizada
              </p>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Faça a primeira busca para trazer as NF-e da SEFAZ.
              </p>
              <Button onClick={handleBuscar} disabled={certVencido || buscando}>
                <Zap className="h-4 w-4 mr-2" /> Fazer a primeira busca
              </Button>
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {historico.slice(0, visibleCount).map((s) => (
                  <TimelineItem key={s.id} sinc={s} />
                ))}
              </ul>
              {historico.length > visibleCount && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleCount((c) => c + 5)}
                  >
                    Carregar mais
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmToggleOpen} onOpenChange={setConfirmToggleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar monitoramento automático?</AlertDialogTitle>
            <AlertDialogDescription>
              O worker deixará de buscar NF-e para <b>{empresa.razao_social}</b>{" "}
              na SEFAZ. Você ainda poderá disparar buscas manuais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDisable}>
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TimelineItem({ sinc }: { sinc: Sincronizacao }) {
  const [open, setOpen] = useState(false);
  const cfg = {
    concluida: {
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50 border-green-200",
      label: "Concluída",
    },
    erro: {
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50 border-red-200",
      label: "Erro",
    },
    em_andamento: {
      icon: Loader2,
      color: "text-blue-600 animate-spin",
      bg: "bg-blue-50 border-blue-200",
      label: "Em andamento",
    },
    pendente: {
      icon: Clock,
      color: "text-slate-400",
      bg: "bg-slate-50 border-slate-200",
      label: "Pendente",
    },
  }[sinc.status];
  const Icon = cfg.icon;
  const OriginIcon = sinc.origem === "manual" ? User : RefreshCw;

  return (
    <li
      className={cn(
        "border rounded-lg p-4 transition-colors",
        cfg.bg,
        sinc.status === "erro" && "cursor-pointer hover:bg-red-100/50",
      )}
      onClick={() => sinc.status === "erro" && setOpen((o) => !o)}
    >
      <div className="flex items-center gap-4">
        <Icon className={cn("h-5 w-5 shrink-0", cfg.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{cfg.label}</span>
            <Badge variant="outline" className="text-[10px] gap-1 bg-white">
              <OriginIcon className="h-3 w-3" />
              {sinc.origem === "manual" ? "Manual" : "Automática"}
            </Badge>
            {sinc.documentos_novos > 0 && (
              <Badge className="bg-primary/10 text-primary border-primary/20" variant="outline">
                +{sinc.documentos_novos} novas
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1" title={formatFull(sinc.iniciado_em)}>
            {formatRelative(sinc.iniciado_em)} · duração{" "}
            {durationLabel(sinc.iniciado_em, sinc.finalizado_em)}
          </p>
        </div>
      </div>
      {sinc.status === "erro" && open && sinc.mensagem_erro && (
        <div className="mt-3 pl-9 text-sm text-red-700 border-t border-red-200 pt-3">
          {sinc.mensagem_erro}
        </div>
      )}
    </li>
  );
}
