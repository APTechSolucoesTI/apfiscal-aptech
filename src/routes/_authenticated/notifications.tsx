import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bell, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: Notifications,
});

type NotificationRow = {
  id: string;
  type: string | null;
  channel: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type SettingsRow = {
  id: string;
  email_enabled: boolean | null;
  webhook_url: string | null;
};

function Notifications() {
  const queryClient = useQueryClient();
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [webhook, setWebhook] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["notification_settings"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return null;
      const { data, error } = await supabase
        .from("notification_settings")
        .select("id, email_enabled, webhook_url")
        .eq("user_id", userRes.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SettingsRow | null;
    },
  });

  useEffect(() => {
    if (settings) {
      setEmailEnabled(settings.email_enabled ?? true);
      setWebhook(settings.webhook_url ?? "");
    }
  }, [settings]);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, channel, payload, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Sessão expirada.");
      const { data: orgId, error: orgErr } = await supabase.rpc("ensure_user_organization");
      if (orgErr) throw orgErr;
      const payload = {
        user_id: userRes.user.id,
        organization_id: orgId as unknown as string,
        email_enabled: emailEnabled,
        webhook_url: webhook || null,
      };
      const { error } = await supabase.from("notification_settings").upsert(payload as never, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferências salvas.");
      queryClient.invalidateQueries({ queryKey: ["notification_settings"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro ao salvar."),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Notificações</h1>
        <p className="text-slate-500">Configure canais e veja o histórico de alertas.</p>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" /> Preferências
          </CardTitle>
          <CardDescription>Como você deseja receber alertas de novos documentos e eventos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Notificações por e-mail</Label>
              <p className="text-sm text-slate-500">Receba alertas de novas NF-e e vencimento de certificados.</p>
            </div>
            <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
          </div>
          <div className="space-y-2">
            <Label>Webhook (opcional)</Label>
            <Input placeholder="https://seu-erp.com/webhooks/apfiscal" value={webhook} onChange={(e) => setWebhook(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-blue-600">
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar preferências
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">Histórico de Notificações</CardTitle>
          <CardDescription>Últimos 50 eventos enviados.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">Sem notificações no momento.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <div key={n.id} className="py-3 flex items-start gap-3">
                  <div className={`mt-1 h-2 w-2 rounded-full ${n.read_at ? "bg-slate-300" : "bg-blue-500"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{n.type ?? "Alerta"}</p>
                      {n.channel && <Badge variant="secondary" className="text-[10px]">{n.channel}</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
