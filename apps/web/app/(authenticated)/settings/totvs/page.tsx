"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Database,
  Loader2,
  Play,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  enqueueNfeSync,
  enqueueNfseSync,
  enqueueTotvsSync,
  getTotvsSettings,
  saveTotvsSettings,
  testNfseConnection,
  testTotvsConnection,
} from "@/services/totvsService";

type FormState = {
  enabled: boolean;
  readSyncEnabled: boolean;
  integrationEnabled: boolean;
  timezone: string;
  scheduleHours: string;
  safetyWindowDays: number;
  companyMappings: Array<{
    companyId: string;
    connectionKey: string | null;
    coligadaId: number | null;
    filialId: number | null;
  }>;
  nfeSchedules: Array<{ companyId: string; enabled: boolean; intervalMinutes: number }>;
  nfseSchedules: Array<{
    companyId: string;
    enabled: boolean;
    intervalMinutes: number;
    provider: "nacional_adn" | "sigiss" | "municipal";
  }>;
};

const statusStyle: Record<string, string> = {
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700",
  running: "border-blue-200 bg-blue-50 text-blue-700",
  queued: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  partial: "border-orange-200 bg-orange-50 text-orange-700",
  blocked: "border-slate-300 bg-slate-100 text-slate-700",
};

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function cooldown(value: string | null | undefined) {
  if (!value) return { active: false, label: null };
  const date = new Date(value);
  const remainingMinutes = Math.ceil((date.getTime() - Date.now()) / 60_000);
  if (remainingMinutes <= 0) return { active: false, label: null };
  const remainingHours = Math.ceil(remainingMinutes / 60);
  const remaining =
    remainingMinutes >= 60
      ? `${remainingHours} ${remainingHours === 1 ? "hora" : "horas"}`
      : `${remainingMinutes} ${remainingMinutes === 1 ? "minuto" : "minutos"}`;
  return {
    active: true,
    label: `Consulta protegida até ${date.toLocaleString("pt-BR")} — faltam aproximadamente ${remaining}. O automático retomará sozinho.`,
  };
}

function runSummary(metrics: Record<string, unknown>) {
  const entities =
    metrics.entities && typeof metrics.entities === "object"
      ? (metrics.entities as Record<string, unknown>)
      : {};
  const parts = Object.entries(entities).map(([entity, raw]) => {
    const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    if (value.error) return `${entity}: erro`;
    return `${entity}: ${Number(value.read ?? 0)} lidos / ${Number(value.materialized ?? 0)} gravados`;
  });
  return parts.join(" • ") || "Execução sem métricas detalhadas";
}

export default function TotvsSettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["totvs-settings"],
    queryFn: getTotvsSettings,
    refetchInterval: 15_000,
  });
  const [form, setForm] = useState<FormState | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>("");

  useEffect(() => {
    if (!query.data || form) return;
    setForm({
      enabled: query.data.settings.enabled,
      readSyncEnabled: query.data.settings.read_sync_enabled,
      integrationEnabled: query.data.settings.integration_enabled,
      timezone: query.data.settings.timezone,
      scheduleHours: query.data.settings.schedule_hours.join(", "),
      safetyWindowDays: query.data.settings.safety_window_days,
      companyMappings: query.data.companies.map((company) => ({
        companyId: company.id,
        connectionKey: company.totvs_connection_key,
        coligadaId: company.totvs_coligada_id,
        filialId: company.totvs_filial_id,
      })),
      nfeSchedules: query.data.companies.map((company) => {
        const schedule = query.data.nfeSchedules.find((item) => item.company_id === company.id);
        return {
          companyId: company.id,
          enabled: schedule?.automatic_sync_enabled ?? false,
          intervalMinutes: schedule?.sync_interval_minutes ?? 60,
        };
      }),
      nfseSchedules: query.data.companies.map((company) => {
        const schedule = query.data.nfeSchedules.find((item) => item.company_id === company.id);
        return {
          companyId: company.id,
          enabled: schedule?.nfse_automatic_sync_enabled ?? false,
          intervalMinutes: schedule?.nfse_sync_interval_minutes ?? 60,
          provider: schedule?.nfse_provider ?? "nacional_adn",
        };
      }),
    });
    setSelectedConnection(query.data.environment.defaultConnectionKey);
  }, [query.data, form]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const scheduleHours = form.scheduleHours
        .split(",")
        .map((hour) => Number(hour.trim()))
        .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);
      if (scheduleHours.length === 0)
        throw new Error("Informe pelo menos um horário válido entre 0 e 23.");
      return saveTotvsSettings({ ...form, scheduleHours });
    },
    onSuccess: async () => {
      toast.success("Configurações de sincronização salvas.");
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["totvs-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const test = useMutation({
    mutationFn: () => testTotvsConnection(selectedConnection || undefined),
    onSuccess: (result) => toast.success(`Conexão validada com ${result.database}.`),
    onError: (error: Error) => toast.error(error.message),
  });
  const sync = useMutation({
    mutationFn: () => enqueueTotvsSync(selectedConnection || undefined),
    onSuccess: async (result) => {
      toast.success(
        result.idempotent
          ? "A sincronização já estava em andamento."
          : "Sincronização adicionada à fila.",
      );
      await queryClient.invalidateQueries({ queryKey: ["totvs-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading || !form)
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando sincronizações…
      </div>
    );
  if (query.isError || !query.data)
    return (
      <Card className="border-red-200">
        <CardContent className="py-12 text-center text-red-700">
          Não foi possível carregar as sincronizações.
        </CardContent>
      </Card>
    );
  const environment = query.data.environment;
  const readyToSync =
    environment.sqlConfigured &&
    environment.redisConfigured &&
    form.enabled &&
    form.readSyncEnabled;
  const selectedEnvironment = environment.connections.find(
    (connection) => connection.key === selectedConnection,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Operação</p>
          <h1 className="text-2xl font-bold tracking-tight">Sincronizações</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Controle a recorrência da NF-e, a leitura do TOTVS RM e acompanhe cada execução em um só
            lugar.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={selectedConnection} onValueChange={setSelectedConnection}>
            <SelectTrigger className="min-w-48 bg-white">
              <SelectValue placeholder="Conexão TOTVS" />
            </SelectTrigger>
            <SelectContent>
              {environment.connections.map((connection) => (
                <SelectItem key={connection.key} value={connection.key}>
                  {connection.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={!selectedEnvironment?.configured || test.isPending}
          >
            {test.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            Testar SELECT 1
          </Button>
          <Button
            onClick={() => sync.mutate()}
            disabled={!readyToSync || !selectedEnvironment?.configured || sync.isPending}
          >
            {sync.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Sincronizar agora
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Server
              className={
                environment.sqlConfigured ? "h-5 w-5 text-emerald-600" : "h-5 w-5 text-amber-600"
              }
            />
            <div>
              <p className="text-xs text-slate-500">SQL Server</p>
              <p className="text-sm font-semibold">
                {environment.sqlConfigured ? "Configurado" : "Variáveis ausentes"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Activity
              className={
                environment.redisConfigured ? "h-5 w-5 text-emerald-600" : "h-5 w-5 text-amber-600"
              }
            />
            <div>
              <p className="text-xs text-slate-500">Redis / BullMQ</p>
              <p className="text-sm font-semibold">
                {environment.redisConfigured ? "Filas ativas" : "REDIS_URL ausente"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {environment.writesEnabled ? (
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            )}
            <div>
              <p className="text-xs text-slate-500">Escrita no RM</p>
              <p className="text-sm font-semibold">
                {environment.writesEnabled ? "Habilitada no ambiente" : "Bloqueada (seguro)"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="config">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="config">TOTVS RM</TabsTrigger>
          <TabsTrigger value="nfe">NF-e automática</TabsTrigger>
          <TabsTrigger value="nfse">NFS-e automática</TabsTrigger>
          <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
          <TabsTrigger value="runs">Logs</TabsTrigger>
          <TabsTrigger value="integrations">NF-e → RM</TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Operação e agenda</CardTitle>
              <CardDescription>
                Horários no fuso informado; padrão 06h, 08h, 12h, 16h e 20h.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex items-center justify-between rounded-lg border p-4">
                  <span>
                    <span className="block text-sm font-medium">Integração ativa</span>
                    <span className="text-xs text-slate-500">Chave geral</span>
                  </span>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border p-4">
                  <span>
                    <span className="block text-sm font-medium">Leitura RM → APFiscal</span>
                    <span className="text-xs text-slate-500">Cadastros e referências</span>
                  </span>
                  <Switch
                    checked={form.readSyncEnabled}
                    onCheckedChange={(readSyncEnabled) => setForm({ ...form, readSyncEnabled })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border p-4">
                  <span>
                    <span className="block text-sm font-medium">Escrita NF-e → RM</span>
                    <span className="text-xs text-slate-500">Exige SQL homologado</span>
                  </span>
                  <Switch
                    disabled={!environment.writesEnabled}
                    checked={form.integrationEnabled}
                    onCheckedChange={(integrationEnabled) =>
                      setForm({ ...form, integrationEnabled })
                    }
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Horários (0–23, separados por vírgula)</Label>
                  <Input
                    value={form.scheduleHours}
                    onChange={(event) => setForm({ ...form, scheduleHours: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fuso horário</Label>
                  <Input
                    value={form.timezone}
                    onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Janela de segurança (dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={form.safetyWindowDays}
                    onChange={(event) =>
                      setForm({ ...form, safetyWindowDays: Number(event.target.value) })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Empresas e escopo TOTVS</CardTitle>
                {query.data.totvsStructure.homologationMode ? (
                  <Badge className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50">
                    Ambiente de homologação
                  </Badge>
                ) : (
                  <Badge variant="outline">Ambiente principal</Badge>
                )}
              </div>
              <CardDescription>
                {query.data.totvsStructure.homologationMode
                  ? "As leituras e gravações usam automaticamente a conexão correspondente com sufixo _HOMOLOG. "
                  : "As leituras e gravações usam as conexões principais. "}
                {query.data.totvsStructure.mode === "FILIAL"
                  ? `Conta configurada Por Filial na coligada ${query.data.totvsStructure.mainColigadaId}. Informe o CODFILIAL de cada empresa.`
                  : "Conta configurada Por Coligada. Cada empresa usa sua própria CODCOLIGADA."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {query.data.companies.map((company) => {
                  const mapping = form.companyMappings.find(
                    (item) => item.companyId === company.id,
                  );
                  const connection = environment.connections.find(
                    (item) => item.key === mapping?.connectionKey,
                  );
                  return (
                    <div key={company.id} className="space-y-3 rounded-lg border p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {company.nome_fantasia || company.razao_social}
                        </p>
                        <p className="font-mono text-xs text-slate-500">{company.cnpj}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={mapping?.connectionKey ?? "none"}
                          onValueChange={(value) =>
                            setForm({
                              ...form,
                              companyMappings: form.companyMappings.map((item) =>
                                item.companyId === company.id
                                  ? {
                                      ...item,
                                      connectionKey: value === "none" ? null : value,
                                      coligadaId: null,
                                      filialId: null,
                                    }
                                  : item,
                              ),
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem conexão</SelectItem>
                            {environment.connections.map((item) => (
                              <SelectItem key={item.key} value={item.key}>
                                {item.description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {query.data.totvsStructure.mode === "FILIAL" ? (
                          <div className="relative">
                            <Input
                              type="number"
                              min={1}
                              disabled={!connection}
                              value={mapping?.filialId ?? ""}
                              placeholder="CODFILIAL"
                              aria-label={`Filial TOTVS de ${company.nome_fantasia || company.razao_social}`}
                              onChange={(event) =>
                                setForm({
                                  ...form,
                                  companyMappings: form.companyMappings.map((item) =>
                                    item.companyId === company.id
                                      ? {
                                          ...item,
                                          filialId: event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </div>
                        ) : (
                          <Select
                            disabled={!connection}
                            value={mapping?.coligadaId ? String(mapping.coligadaId) : "none"}
                            onValueChange={(value) =>
                              setForm({
                                ...form,
                                companyMappings: form.companyMappings.map((item) =>
                                  item.companyId === company.id
                                    ? {
                                        ...item,
                                        coligadaId: value === "none" ? null : Number(value),
                                      }
                                    : item,
                                ),
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Coligada</SelectItem>
                              {connection?.coligadas.map((id) => (
                                <SelectItem key={id} value={String(id)}>
                                  Coligada {id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  configuração
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="nfe" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recorrência da consulta NF-e</CardTitle>
              <CardDescription>
                Worker persistente, lock por empresa e watchdog de agendamentos atrasados. Workers
                ativos: {query.data.scheduler.workers}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {query.data.companies.map((company) => {
                  const schedule = form.nfeSchedules.find((item) => item.companyId === company.id);
                  const history = query.data.fiscalRuns.find(
                    (item) => item.company_id === company.id && item.acao === "sync_distribuicao",
                  );
                  const next = query.data.scheduler.schedulers.find(
                    (item) => item.key === `nfe-sync-${company.id}`,
                  )?.next;
                  const state = query.data.fiscalStates.find(
                    (item) => item.company_id === company.id,
                  );
                  const syncCooldown = cooldown(state?.next_allowed_sync_at);
                  return (
                    <div key={company.id} className="space-y-4 rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {company.nome_fantasia || company.razao_social}
                          </p>
                          <p className="font-mono text-xs text-slate-500">{company.cnpj}</p>
                        </div>
                        <Switch
                          disabled={!query.data.accountPlan.features.automatic_nfe}
                          checked={schedule?.enabled ?? false}
                          onCheckedChange={(enabled) =>
                            setForm({
                              ...form,
                              nfeSchedules: form.nfeSchedules.map((item) =>
                                item.companyId === company.id ? { ...item, enabled } : item,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-xs">
                        <div>
                          <p className="text-slate-500">Última execução</p>
                          <p className="font-medium">{when(history?.created_at)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Próxima execução</p>
                          <p className="font-medium">{when(next)}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-500">Status / último erro</p>
                          <p
                            className={
                              history && !history.sucesso ? "text-red-600" : "text-emerald-700"
                            }
                          >
                            {history?.mensagem ||
                              (history ? "Execução concluída." : "Sem execução")}
                          </p>
                        </div>
                        {syncCooldown.active && (
                          <div className="col-span-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                            {syncCooldown.label}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Intervalo entre consultas (minutos)</Label>
                        <Input
                          type="number"
                          min={15}
                          max={1440}
                          value={schedule?.intervalMinutes ?? 60}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              nfeSchedules: form.nfeSchedules.map((item) =>
                                item.companyId === company.id
                                  ? { ...item, intervalMinutes: Number(event.target.value) }
                                  : item,
                              ),
                            })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={syncCooldown.active}
                        onClick={() =>
                          enqueueNfeSync(company.id)
                            .then(() => toast.success("Consulta NF-e adicionada à fila."))
                            .catch(async (error: Error) => {
                              toast.error(error.message);
                              await queryClient.invalidateQueries({ queryKey: ["totvs-settings"] });
                            })
                        }
                      >
                        <Play className="mr-2 h-4 w-4" />
                        {syncCooldown.active
                          ? "Aguardando liberação da SEFAZ"
                          : "Sincronizar agora"}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  recorrências
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="nfse" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">NFS-e recebidas pelo ADN Nacional</CardTitle>
              <CardDescription>
                Consulta oficial por NSU com certificado A1. Municípios fora do ADN exigem adapter
                municipal específico.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {query.data.companies.map((company) => {
                  const schedule = form.nfseSchedules.find((item) => item.companyId === company.id);
                  const stored = query.data.nfeSchedules.find(
                    (item) => item.company_id === company.id,
                  );
                  const syncCooldown = cooldown(stored?.nfse_next_allowed_sync_at);
                  return (
                    <div key={company.id} className="space-y-4 rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {company.nome_fantasia || company.razao_social}
                          </p>
                          <p className="font-mono text-xs text-slate-500">{company.cnpj}</p>
                        </div>
                        <Switch
                          disabled={!query.data.accountPlan.features.automatic_nfse}
                          checked={schedule?.enabled ?? false}
                          onCheckedChange={(enabled) =>
                            setForm({
                              ...form,
                              nfseSchedules: form.nfseSchedules.map((item) =>
                                item.companyId === company.id ? { ...item, enabled } : item,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Provider</Label>
                          <Select
                            value={schedule?.provider ?? "nacional_adn"}
                            onValueChange={(provider: "nacional_adn" | "sigiss" | "municipal") =>
                              setForm({
                                ...form,
                                nfseSchedules: form.nfseSchedules.map((item) =>
                                  item.companyId === company.id ? { ...item, provider } : item,
                                ),
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nacional_adn">Nacional (ADN)</SelectItem>
                              <SelectItem value="sigiss">SIGISS</SelectItem>
                              <SelectItem value="municipal">Municipal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Intervalo (minutos)</Label>
                          <Input
                            type="number"
                            min={15}
                            max={1440}
                            value={schedule?.intervalMinutes ?? 60}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                nfseSchedules: form.nfseSchedules.map((item) =>
                                  item.companyId === company.id
                                    ? { ...item, intervalMinutes: Number(event.target.value) }
                                    : item,
                                ),
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="rounded-md bg-slate-50 p-3 text-xs">
                        <p>Última: {when(stored?.nfse_last_sync_at)}</p>
                        {syncCooldown.active && (
                          <p className="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                            {syncCooldown.label}
                          </p>
                        )}
                        <p
                          className={
                            stored?.nfse_last_error ? "mt-1 text-red-600" : "mt-1 text-emerald-700"
                          }
                        >
                          {stored?.nfse_last_error || "Sem erro registrado"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={syncCooldown.active}
                          variant="outline"
                          onClick={() =>
                            testNfseConnection(company.id)
                              .then(async (result) => {
                                result.ok
                                  ? toast.success(result.message)
                                  : toast.error(result.message);
                                if (!result.ok)
                                  await queryClient.invalidateQueries({
                                    queryKey: ["totvs-settings"],
                                  });
                              })
                              .catch(async (error: Error) => {
                                toast.error(error.message);
                                await queryClient.invalidateQueries({
                                  queryKey: ["totvs-settings"],
                                });
                              })
                          }
                        >
                          Testar ADN
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={syncCooldown.active}
                          onClick={() =>
                            enqueueNfseSync(company.id)
                              .then(() => toast.success("Consulta NFS-e adicionada à fila."))
                              .catch(async (error: Error) => {
                                toast.error(error.message);
                                await queryClient.invalidateQueries({
                                  queryKey: ["totvs-settings"],
                                });
                              })
                          }
                        >
                          <Play className="mr-2 h-4 w-4" />
                          {syncCooldown.active ? "Aguardando liberação" : "Sincronizar agora"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar NFS-e
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="checkpoints" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progresso incremental</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Último sucesso</TableHead>
                    <TableHead>Watermark</TableHead>
                    <TableHead>Linhas</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.checkpoints.length ? (
                    query.data.checkpoints.map((row) => (
                      <TableRow key={row.entity}>
                        <TableCell className="font-medium">{row.entity}</TableCell>
                        <TableCell>{when(row.last_success_at)}</TableCell>
                        <TableCell>{when(row.source_watermark)}</TableCell>
                        <TableCell>{row.rows_processed}</TableCell>
                        <TableCell
                          className="max-w-72 truncate text-red-600"
                          title={row.last_error ?? undefined}
                        >
                          {row.last_error || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                        Nenhum checkpoint. Execute a primeira sincronização.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="runs" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leituras do TOTVS RM</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criado</TableHead>
                    <TableHead>Gatilho</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Finalizado</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.runs.length ? (
                    query.data.runs.map((run) => {
                      const detail = run.error_message || runSummary(run.metrics);
                      return (
                        <TableRow key={run.id}>
                          <TableCell>{when(run.created_at)}</TableCell>
                          <TableCell>{run.trigger}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusStyle[run.status]}>
                              {run.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{when(run.finished_at)}</TableCell>
                          <TableCell
                            className={`max-w-96 truncate ${run.error_message ? "text-red-600" : "text-slate-600"}`}
                            title={detail}
                          >
                            {detail}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                        Nenhuma execução.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consultas e eventos NF-e</CardTitle>
              <CardDescription>
                Registro do provedor usado, resultado, mensagem e horário por empresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Ação / provedor</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.fiscalRuns.length ? (
                    query.data.fiscalRuns.map((run) => {
                      const company = query.data.companies.find(
                        (item) => item.id === run.company_id,
                      );
                      const provider =
                        typeof run.payload_bruto?.provider === "string"
                          ? run.payload_bruto.provider
                          : null;
                      return (
                        <TableRow key={run.id}>
                          <TableCell>{when(run.created_at)}</TableCell>
                          <TableCell>
                            {company?.nome_fantasia ||
                              company?.razao_social ||
                              run.company_id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            {run.acao}
                            {provider ? ` · ${provider}` : ""}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={run.sucesso ? statusStyle.succeeded : statusStyle.failed}
                            >
                              {run.sucesso ? "Sucesso" : "Erro"}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="max-w-96 truncate"
                            title={run.mensagem ?? undefined}
                          >
                            {run.mensagem || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                        Nenhuma consulta NF-e registrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="integrations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Integrações de NF-e</CardTitle>
              <CardDescription>
                Uma nota só recebe “Integrado TOTVS” depois de uma transação real confirmada pelo
                RM.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criado</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Retorno RM</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.integrationRuns.length ? (
                    query.data.integrationRuns.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>{when(run.created_at)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {run.fiscal_document_id.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusStyle[run.status]}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{run.attempt}</TableCell>
                        <TableCell>{run.rm_record_id || "—"}</TableCell>
                        <TableCell
                          className="max-w-96 truncate text-red-600"
                          title={run.error_message ?? undefined}
                        >
                          {run.error_message || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                        Nenhuma NF-e enviada ao RM.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
