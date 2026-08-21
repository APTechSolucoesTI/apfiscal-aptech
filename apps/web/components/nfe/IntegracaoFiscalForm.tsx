"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NfeProviderKind } from "@apfiscal/shared";
import { AlertCircle, CheckCircle2, FileKey2, Loader2, PlugZap, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getFiscalSettings, saveFiscalSettings, testFiscalProvider, uploadNfeWizardCertificate } from "@/services/fiscalIntegrationService";

type Props = { companyId: string | null; cnpj?: string | null };
const providers: Array<{ id: NfeProviderKind; title: string; description: string; badge?: string }> = [
  { id: "nfewizard", title: "NFeWizard", description: "Consulta direta à SEFAZ com certificado A1, checkpoint de NSU e controle de consumo.", badge: "Recomendado" },
  { id: "apifiscal", title: "APFiscal API", description: "Conector legado mantido para contingência e compatibilidade operacional." },
];

export function IntegracaoFiscalForm({ companyId, cnpj }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<NfeProviderKind>("nfewizard");
  const [active, setActive] = useState(true);
  const [fallback, setFallback] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const settings = useQuery({ queryKey: ["fiscal-provider-settings", companyId], queryFn: () => getFiscalSettings(companyId!), enabled: Boolean(companyId) });

  useEffect(() => {
    if (!settings.data) return;
    setProvider(settings.data.primary_provider);
    setActive(settings.data.ativo);
    setFallback(settings.data.fallback_enabled && settings.data.apifiscalConfigured);
  }, [settings.data]);

  if (!companyId) return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Salve a empresa para habilitar a integração fiscal.</div>;

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveFiscalSettings(companyId, { primaryProvider: provider, fallbackProvider: provider === "nfewizard" ? "apifiscal" : null, fallbackEnabled: provider === "nfewizard" && fallback && Boolean(settings.data?.apifiscalConfigured), active });
      await queryClient.invalidateQueries({ queryKey: ["fiscal-provider-settings", companyId] });
      toast.success("Configuração fiscal salva.");
      if (result.warning) toast.warning(result.warning);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a configuração."); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await testFiscalProvider(companyId, provider);
      result.ok ? toast.success(result.message) : toast.error(result.message);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha no teste de conexão."); }
    finally { setTesting(false); }
  };

  const upload = async () => {
    if (!file || !password) return;
    setUploading(true);
    try {
      const result = await uploadNfeWizardCertificate(companyId, file, password);
      setFile(null); setPassword("");
      if (fileRef.current) fileRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["fiscal-provider-settings", companyId] });
      toast.success("Certificado A1 armazenado com segurança.");
      if (result.apifiscal.configured) toast.success("Fallback APFiscal provisionado.");
    } catch (error) { setPassword(""); toast.error(error instanceof Error ? error.message : "Falha ao enviar o certificado."); }
    finally { setUploading(false); }
  };

  if (settings.isLoading) return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando integração fiscal…</div>;
  if (settings.isError) return <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4" /> Não foi possível carregar a configuração. Tente novamente.</div>;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2 font-semibold"><ServerCog className="h-4 w-4 text-primary" /> Provedor de NF-e</div><p className="mt-1 text-sm text-muted-foreground">Escolha como consultar documentos emitidos contra {cnpj ? <span className="font-mono text-foreground">{cnpj}</span> : "o CNPJ cadastrado"}.</p></div>
      <div className="flex items-center gap-3 rounded-full border bg-muted/40 px-3 py-2"><span className="text-xs font-medium">Integração ativa</span><Switch checked={active} onCheckedChange={setActive} aria-label="Ativar integração fiscal" /></div>
    </div>

    <RadioGroup value={provider} onValueChange={(value) => setProvider(value as NfeProviderKind)} className="grid gap-3 lg:grid-cols-2">
      {providers.map((item) => <Label key={item.id} htmlFor={`provider-${item.id}`} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:border-primary/50", provider === item.id && "border-primary bg-primary/[0.035] ring-1 ring-primary/20")}>
        <RadioGroupItem id={`provider-${item.id}`} value={item.id} className="mt-1" />
        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-sm font-semibold">{item.title}{item.badge && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{item.badge}</Badge>}</span><span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{item.description}</span></span>
      </Label>)}
    </RadioGroup>

    {provider === "nfewizard" && <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Certificado digital A1</div>{settings.data?.certificateConfigured ? <Badge variant="outline" className="border-emerald-200 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Configurado</Badge> : <Badge variant="outline" className="border-amber-200 text-amber-700">Pendente</Badge>}</div>
      <div className="grid gap-4 md:grid-cols-2"><div className="grid gap-2"><Label htmlFor="nfe-certificate">Arquivo .pfx ou .p12</Label><Input ref={fileRef} id="nfe-certificate" type="file" accept=".pfx,.p12" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div><div className="grid gap-2"><Label htmlFor="nfe-certificate-password">Senha do certificado</Label><Input id="nfe-certificate-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Arquivo privado; senha criptografada com AES-256-GCM no backend.</p><Button type="button" variant="outline" onClick={upload} disabled={!file || !password || uploading}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileKey2 className="mr-2 h-4 w-4" />}{settings.data?.certificateConfigured ? "Substituir certificado" : "Enviar certificado"}</Button></div>
      <div className="flex items-start justify-between gap-4 border-t pt-4"><div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">Contingência APFiscal</p>{settings.data?.apifiscalConfigured ? <Badge variant="outline" className="border-emerald-200 text-emerald-700">Disponível</Badge> : <Badge variant="outline" className="border-slate-200 text-slate-600">Opcional</Badge>}</div><p className="text-xs text-muted-foreground">Entra somente se o NFeWizard estiver configurado e indisponível. Erros de certificado ou cadastro nunca acionam o legado.</p>{!settings.data?.apifiscalConfigured && <p className="text-xs text-muted-foreground">Sem credenciais do conector legado; a contingência permanecerá desligada.</p>}</div><Switch checked={fallback} onCheckedChange={setFallback} disabled={!settings.data?.apifiscalConfigured} aria-label="Ativar contingência APFiscal" /></div>
    </div>}

    <div className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Último NSU</p><p className="mt-1 font-mono font-medium">{settings.data?.checkpoint?.last_nsu ?? 0}</p></div><div><p className="text-xs text-muted-foreground">Última consulta</p><p className="mt-1 font-medium">{settings.data?.checkpoint?.last_sync_at ? new Date(settings.data.checkpoint.last_sync_at).toLocaleString("pt-BR") : "Ainda não executada"}</p></div><div><p className="text-xs text-muted-foreground">Status SEFAZ</p><p className="mt-1 font-medium">{settings.data?.checkpoint?.last_cstat ?? "Sem retorno"}</p></div></div>
    <div className="flex flex-wrap gap-2"><Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Salvar configuração</Button><Button type="button" variant="outline" onClick={test} disabled={testing || (provider === "nfewizard" && !settings.data?.certificateConfigured)}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}Testar conexão</Button></div>
  </div>;
}
