"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, Database, Loader2, Play, RefreshCw, Server, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { enqueueTotvsSync, getTotvsSettings, saveTotvsSettings, testTotvsConnection } from "@/services/totvsService";

type FormState = {
  enabled: boolean;
  readSyncEnabled: boolean;
  integrationEnabled: boolean;
  timezone: string;
  scheduleHours: string;
  safetyWindowDays: number;
  companyMappings: Array<{ companyId: string; coligadaId: number | null }>;
};

const statusStyle: Record<string, string> = {
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700",
  running: "border-blue-200 bg-blue-50 text-blue-700",
  queued: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  blocked: "border-slate-300 bg-slate-100 text-slate-700",
};

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

export default function TotvsSettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["totvs-settings"], queryFn: getTotvsSettings, refetchInterval: 15_000 });
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!query.data || form) return;
    setForm({
      enabled: query.data.settings.enabled,
      readSyncEnabled: query.data.settings.read_sync_enabled,
      integrationEnabled: query.data.settings.integration_enabled,
      timezone: query.data.settings.timezone,
      scheduleHours: query.data.settings.schedule_hours.join(", "),
      safetyWindowDays: query.data.settings.safety_window_days,
      companyMappings: query.data.companies.map((company) => ({ companyId: company.id, coligadaId: company.totvs_coligada_id })),
    });
  }, [query.data, form]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const scheduleHours = form.scheduleHours.split(",").map((hour) => Number(hour.trim())).filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);
      if (scheduleHours.length === 0) throw new Error("Informe pelo menos um horário válido entre 0 e 23.");
      return saveTotvsSettings({ ...form, scheduleHours });
    },
    onSuccess: async () => { toast.success("Configuração TOTVS salva."); setForm(null); await queryClient.invalidateQueries({ queryKey: ["totvs-settings"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const test = useMutation({
    mutationFn: testTotvsConnection,
    onSuccess: (result) => toast.success(`Conexão validada com ${result.database}.`),
    onError: (error: Error) => toast.error(error.message),
  });
  const sync = useMutation({
    mutationFn: enqueueTotvsSync,
    onSuccess: async (result) => { toast.success(result.idempotent ? "A sincronização já estava em andamento." : "Sincronização adicionada à fila."); await queryClient.invalidateQueries({ queryKey: ["totvs-settings"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading || !form) return <div className="flex min-h-64 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando integração TOTVS…</div>;
  if (query.isError || !query.data) return <Card className="border-red-200"><CardContent className="py-12 text-center text-red-700">Não foi possível carregar a configuração TOTVS.</CardContent></Card>;
  const environment = query.data.environment;
  const readyToSync = environment.sqlConfigured && environment.redisConfigured && form.enabled && form.readSyncEnabled;

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-medium text-blue-700">Integrações</p><h1 className="text-2xl font-bold tracking-tight">TOTVS RM</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Sincronização direta e incremental com SQL Server. A leitura está separada da futura escrita de NF-e.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={() => test.mutate()} disabled={!environment.sqlConfigured || test.isPending}>{test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}Testar SELECT 1</Button><Button onClick={() => sync.mutate()} disabled={!readyToSync || sync.isPending}>{sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Sincronizar agora</Button></div>
    </header>

    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="flex items-center gap-3 p-4"><Server className={environment.sqlConfigured ? "h-5 w-5 text-emerald-600" : "h-5 w-5 text-amber-600"} /><div><p className="text-xs text-slate-500">SQL Server</p><p className="text-sm font-semibold">{environment.sqlConfigured ? "Configurado" : "Variáveis ausentes"}</p></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-3 p-4"><Activity className={environment.redisConfigured ? "h-5 w-5 text-emerald-600" : "h-5 w-5 text-amber-600"} /><div><p className="text-xs text-slate-500">Redis / BullMQ</p><p className="text-sm font-semibold">{environment.redisConfigured ? "Filas ativas" : "REDIS_URL ausente"}</p></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-3 p-4">{environment.writesEnabled ? <ShieldAlert className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}<div><p className="text-xs text-slate-500">Escrita no RM</p><p className="text-sm font-semibold">{environment.writesEnabled ? "Habilitada no ambiente" : "Bloqueada (seguro)"}</p></div></CardContent></Card>
    </div>

    <Tabs defaultValue="config"><TabsList className="flex h-auto flex-wrap"><TabsTrigger value="config">Configuração</TabsTrigger><TabsTrigger value="checkpoints">Checkpoints</TabsTrigger><TabsTrigger value="runs">Execuções</TabsTrigger><TabsTrigger value="integrations">NF-e → RM</TabsTrigger></TabsList>
      <TabsContent value="config" className="mt-4 space-y-4">
        <Card><CardHeader><CardTitle className="text-base">Operação e agenda</CardTitle><CardDescription>Horários no fuso informado; padrão 06h, 08h, 12h, 16h e 20h.</CardDescription></CardHeader><CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3"><label className="flex items-center justify-between rounded-lg border p-4"><span><span className="block text-sm font-medium">Integração ativa</span><span className="text-xs text-slate-500">Chave geral</span></span><Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} /></label><label className="flex items-center justify-between rounded-lg border p-4"><span><span className="block text-sm font-medium">Leitura RM → APFiscal</span><span className="text-xs text-slate-500">Cadastros e referências</span></span><Switch checked={form.readSyncEnabled} onCheckedChange={(readSyncEnabled) => setForm({ ...form, readSyncEnabled })} /></label><label className="flex items-center justify-between rounded-lg border p-4"><span><span className="block text-sm font-medium">Escrita NF-e → RM</span><span className="text-xs text-slate-500">Exige SQL homologado</span></span><Switch disabled={!environment.writesEnabled} checked={form.integrationEnabled} onCheckedChange={(integrationEnabled) => setForm({ ...form, integrationEnabled })} /></label></div>
          <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Horários (0–23, separados por vírgula)</Label><Input value={form.scheduleHours} onChange={(event) => setForm({ ...form, scheduleHours: event.target.value })} /></div><div className="space-y-2"><Label>Fuso horário</Label><Input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></div><div className="space-y-2"><Label>Janela de segurança (dias)</Label><Input type="number" min={1} max={30} value={form.safetyWindowDays} onChange={(event) => setForm({ ...form, safetyWindowDays: Number(event.target.value) })} /></div></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Empresas e coligadas</CardTitle><CardDescription>O código da coligada define onde cada registro do RM será materializado no APFiscal.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2">{query.data.companies.map((company) => { const mapping = form.companyMappings.find((item) => item.companyId === company.id); return <div key={company.id} className="flex items-center justify-between gap-4 rounded-lg border p-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{company.nome_fantasia || company.razao_social}</p><p className="font-mono text-xs text-slate-500">{company.cnpj}</p></div><Select value={mapping?.coligadaId ? String(mapping.coligadaId) : "none"} onValueChange={(value) => setForm({ ...form, companyMappings: form.companyMappings.map((item) => item.companyId === company.id ? { ...item, coligadaId: value === "none" ? null : Number(value) } : item) })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem vínculo</SelectItem>{(environment.coligadas.length ? environment.coligadas : [1,2]).map((id) => <SelectItem key={id} value={String(id)}>Coligada {id}</SelectItem>)}</SelectContent></Select></div>; })}</div><div className="mt-5 flex justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar configuração</Button></div></CardContent></Card>
      </TabsContent>
      <TabsContent value="checkpoints" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Progresso incremental</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Entidade</TableHead><TableHead>Último sucesso</TableHead><TableHead>Watermark</TableHead><TableHead>Linhas</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader><TableBody>{query.data.checkpoints.length ? query.data.checkpoints.map((row) => <TableRow key={row.entity}><TableCell className="font-medium">{row.entity}</TableCell><TableCell>{when(row.last_success_at)}</TableCell><TableCell>{when(row.source_watermark)}</TableCell><TableCell>{row.rows_processed}</TableCell><TableCell className="max-w-72 truncate text-red-600" title={row.last_error ?? undefined}>{row.last_error || "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="py-10 text-center text-slate-500">Nenhum checkpoint. Execute a primeira sincronização.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="runs" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Histórico de sincronização</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Criado</TableHead><TableHead>Gatilho</TableHead><TableHead>Status</TableHead><TableHead>Finalizado</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader><TableBody>{query.data.runs.length ? query.data.runs.map((run) => <TableRow key={run.id}><TableCell>{when(run.created_at)}</TableCell><TableCell>{run.trigger}</TableCell><TableCell><Badge variant="outline" className={statusStyle[run.status]}>{run.status}</Badge></TableCell><TableCell>{when(run.finished_at)}</TableCell><TableCell className="max-w-96 truncate text-red-600" title={run.error_message ?? undefined}>{run.error_message || "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="py-10 text-center text-slate-500">Nenhuma execução.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="integrations" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Integrações de NF-e</CardTitle><CardDescription>Uma nota só recebe “Integrado TOTVS” depois de uma transação real confirmada pelo RM.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Criado</TableHead><TableHead>Documento</TableHead><TableHead>Status</TableHead><TableHead>Tentativas</TableHead><TableHead>Retorno RM</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader><TableBody>{query.data.integrationRuns.length ? query.data.integrationRuns.map((run) => <TableRow key={run.id}><TableCell>{when(run.created_at)}</TableCell><TableCell className="font-mono text-xs">{run.fiscal_document_id.slice(0,8)}</TableCell><TableCell><Badge variant="outline" className={statusStyle[run.status]}>{run.status}</Badge></TableCell><TableCell>{run.attempt}</TableCell><TableCell>{run.rm_record_id || "—"}</TableCell><TableCell className="max-w-96 truncate text-red-600" title={run.error_message ?? undefined}>{run.error_message || "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-slate-500">Nenhuma NF-e enviada ao RM.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}
