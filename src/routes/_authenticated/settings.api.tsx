import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key, Copy, Plus, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/settings/api")({
  component: ApiSettings,
});

type ApiKey = {
  id: string;
  key_hash: string;
  created_at: string;
  last_used_at: string | null;
};

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "");
  return `ak_live_${b64}`;
}

function ApiSettings() {
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api_keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, key_hash, created_at, last_used_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiKey[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const key = randomKey();
      const hash = await sha256Hex(key);
      const { data: orgId, error: orgErr } = await supabase.rpc("ensure_user_organization");
      if (orgErr) throw orgErr;
      const { error } = await supabase.from("api_keys").insert({
        organization_id: orgId as unknown as string,
        key_hash: hash,
      } as never);
      if (error) throw error;
      return key;
    },
    onSuccess: (key) => {
      setNewKey(key);
      queryClient.invalidateQueries({ queryKey: ["api_keys"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro ao gerar chave."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chave revogada.");
      queryClient.invalidateQueries({ queryKey: ["api_keys"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro ao revogar."),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Integração via API</h1>
        <p className="text-slate-500">Conecte o APFiscal com seu ERP ou sistema interno.</p>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">Minhas Chaves de API</CardTitle>
          <CardDescription>Use estas chaves para autenticar suas requisições. Guarde-as com segurança — a chave completa só é exibida uma vez.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">Nenhuma chave gerada ainda.</div>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center gap-4 p-3 border border-slate-200 rounded-md">
                  <Key className="h-4 w-4 text-slate-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">ak_live_••••{k.key_hash.slice(-6)}</p>
                    <p className="text-xs text-slate-500">
                      Criada em {new Date(k.created_at).toLocaleDateString("pt-BR")}
                      {k.last_used_at ? ` · Último uso ${new Date(k.last_used_at).toLocaleDateString("pt-BR")}` : " · Nunca usada"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500" onClick={() => deleteMutation.mutate(k.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="secondary"
            className="w-full"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Gerar Nova Chave
          </Button>
        </CardContent>
      </Card>

      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chave gerada com sucesso</DialogTitle>
            <DialogDescription>
              Copie e guarde esta chave agora. Por segurança, ela não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={newKey ?? ""} className="font-mono text-xs bg-slate-50" />
            <Button
              variant="outline"
              onClick={() => {
                if (newKey) {
                  navigator.clipboard.writeText(newKey);
                  toast.success("Chave copiada!");
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
