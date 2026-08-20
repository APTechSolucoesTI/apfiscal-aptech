"use client";

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------- Helpers ----------
function formatRelative(dateISO?: string | null) {
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

function formatDate(dateISO: string) {
  return new Date(dateISO).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatFull(dateISO?: string | null) {
  if (!dateISO) return "";
  return new Date(dateISO).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ---------- Component ----------
function MonitoringPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  const { data: empresas, isLoading: loadingEmpresas } = useQuery({
    queryKey: ["monitoring", "companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, cnpj, razao_social, nome_fantasia, uf")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Auto-select first company
  if (empresas && empresas.length > 0 && !selectedId) {
    setSelectedId(empresas[0].id);
  }

  const { data: docs, isLoading: loadingDocs } = useQuery({
    queryKey: ["monitoring", "docs", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_documents")
        .select("id, tipo, numero, chave_acesso, emitente_nome, valor_total, data_emissao, created_at")
        .eq("company_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const empresa = useMemo(
    () => empresas?.find((e) => e.id === selectedId),
    [empresas, selectedId],
  );

  // Derive sync-like history: group docs by day of created_at
  const historico = useMemo(() => {
    if (!docs) return [];
    const byDay = new Map<string, { day: string; count: number; last: string; first: string }>();
    for (const d of docs) {
      const day = (d.created_at ?? "").slice(0, 10);
      if (!day) continue;
      const entry = byDay.get(day);
      if (entry) {
        entry.count += 1;
        if (d.created_at! > entry.last) entry.last = d.created_at!;
        if (d.created_at! < entry.first) entry.first = d.created_at!;
      } else {
        byDay.set(day, { day, count: 1, last: d.created_at!, first: d.created_at! });
      }
    }
    return Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [docs]);

  const ultimaSinc = docs && docs.length > 0 ? docs[0].created_at : null;
  const novidades24h = useMemo(() => {
    if (!docs) return 0;
    const cutoff = Date.now() - 1000 * 60 * 60 * 24;
    return docs.filter((d) => d.created_at && new Date(d.created_at).getTime() >= cutoff).length;
  }, [docs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["monitoring"] });
    setTimeout(() => setRefreshing(false), 500);
    toast.success("Dados atualizados");
  };

  if (loadingEmpresas) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!empresas || empresas.length === 0) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Monitoramento Fiscal</h1>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <Activity className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">Nenhuma empresa cadastrada</p>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              Cadastre uma empresa para começar o monitoramento fiscal.
            </p>
            <Button asChild>
              <Link to="/companies">Cadastrar empresa</Link>
            </Button>
          </CardContent>
        </Card>
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
                  {e.razao_social}{e.nome_fantasia ? ` (${e.nome_fantasia})` : ""} — {e.cnpj}
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
              <CardTitle className="text-xl">{empresa.razao_social}{empresa.nome_fantasia ? ` (${empresa.nome_fantasia})` : ""}</CardTitle>
              <CardDescription className="mt-1 font-mono">
                {empresa.cnpj}
                {empresa.uf ? ` · ${empresa.uf}` : ""}
              </CardDescription>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                  <Clock className="h-3 w-3 mr-1" />
                  Última sincronização:{" "}
                  <span className="ml-1" title={formatFull(ultimaSinc)}>
                    {formatRelative(ultimaSinc)}
                  </span>
                </Badge>
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                  <FileText className="h-3 w-3 mr-1" />
                  {docs?.length ?? 0} documento(s)
                </Badge>
              </div>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-3">
              <Button
                size="lg"
                onClick={handleRefresh}
                disabled={refreshing}
                className="gap-2 min-w-[220px]"
              >
                {refreshing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Atualizar dados
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Novidades */}
      <Card
        className={cn(
          "border-l-4",
          novidades24h > 0 ? "border-l-primary bg-blue-50/30" : "border-l-slate-200",
        )}
      >
        <CardContent className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center",
                novidades24h > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                {novidades24h > 0
                  ? `${novidades24h} nova(s) nota(s) nas últimas 24h`
                  : "Nenhuma nota nova nas últimas 24h"}
              </p>
              <p className="text-sm text-slate-500">
                Documentos fiscais registrados recentemente para este CNPJ.
              </p>
            </div>
          </div>
          {novidades24h > 0 && (
            <Button asChild variant="default">
              <Link to="/documents/nfe">Ver NF-e</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Histórico de sincronizações</CardTitle>
          <CardDescription>
            Documentos fiscais agrupados por dia de recebimento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDocs ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : historico.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
              <Activity className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">
                Nenhum documento fiscal registrado
              </p>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Ainda não há NF-e sincronizadas para este CNPJ.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {historico.map((h) => (
                <li
                  key={h.day}
                  className="border rounded-lg p-4 bg-green-50 border-green-200"
                >
                  <div className="flex items-center gap-4">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {formatDate(h.day)}
                        </span>
                        <Badge variant="outline" className="text-[10px] gap-1 bg-white">
                          <RefreshCw className="h-3 w-3" />
                          Automática
                        </Badge>
                        <Badge
                          className="bg-primary/10 text-primary border-primary/20"
                          variant="outline"
                        >
                          +{h.count} documento(s)
                        </Badge>
                      </div>
                      <p
                        className="text-xs text-slate-500 mt-1"
                        title={formatFull(h.last)}
                      >
                        Último recebimento {formatRelative(h.last)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MonitoringPage;
