import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/api-action";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getNfeDetails } from "@/lib/client-actions";
import { aprovarNfe } from "@/lib/client-actions";

const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NfeAprovacaoDialog({
  documentId,
  open,
  onOpenChange,
}: {
  documentId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const detailsFn = useServerFn(getNfeDetails);
  const aprovarFn = useServerFn(aprovarNfe);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["nfe-aprovacao", documentId],
    queryFn: () => detailsFn({ data: { id: documentId! } }),
    enabled: open && !!documentId,
  });

  useQuery({
    queryKey: ["current-user-email"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user?.email) setEmail((e) => e || u.user!.email!);
      return u.user?.email ?? null;
    },
    enabled: open,
  });

  const doc = data?.document as any;
  const items = (data?.items ?? []) as any[];

  const aprovarMut = useMutation({
    mutationFn: () => aprovarFn({ data: { documentId: documentId!, email, password } }),
    onSuccess: () => {
      toast.success("NF-e aprovada com sucesso.");
      setPassword("");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["fiscal_documents"] });
      qc.invalidateQueries({ queryKey: ["nfe-details", documentId] });
      qc.invalidateQueries({ queryKey: ["nfe-status-historico", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!aprovarMut.isPending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aprovar NF-e</DialogTitle>
          <DialogDescription>Revise os dados da nota antes de confirmar a aprovação.</DialogDescription>
        </DialogHeader>

        {isLoading || !doc ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Número / Série" value={`${doc.numero ?? "-"} / ${doc.serie ?? "-"}`} />
              <Field label="Data de emissão" value={doc.data_emissao ? new Date(doc.data_emissao).toLocaleString("pt-BR") : "-"} />
              <Field label="Emitente" value={`${doc.emitente_nome ?? "-"} (${doc.emitente_cnpj ?? "-"})`} />
              <Field label="Destinatário" value={`${doc.destinatario_nome ?? doc.companies?.razao_social ?? "-"} (${doc.destinatario_cnpj ?? doc.companies?.cnpj ?? "-"})`} />
              <Field label="Natureza da operação" value={doc.natureza_operacao ?? "-"} />
              <Field label="Valor total" value={fmt(doc.valor_total)} />
              <div className="col-span-2">
                <Field label="Chave de acesso" value={doc.chave_acesso ?? "-"} mono />
              </div>
            </div>

            <div className="rounded-md border border-slate-200">
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 border-b bg-slate-50">Itens ({items.length})</div>
              <div className="max-h-48 overflow-auto divide-y">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                    <span className="truncate text-slate-700">{it.numero_item}. {it.descricao}</span>
                    <span className="shrink-0 text-slate-500">{Number(it.quantidade_comercial ?? 0)} × {fmt(it.valor_unitario_comercial)} = <strong className="text-slate-800">{fmt(it.valor_bruto)}</strong></span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Deseja confirmar a Aprovação desta NF-e?
              </p>
              <p className="text-xs text-amber-800">Por segurança, reinsira as credenciais da sua conta.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="apv-email" className="text-xs">Usuário (e-mail)</Label>
                  <Input id="apv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="apv-pass" className="text-xs">Senha</Label>
                  <Input id="apv-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={aprovarMut.isPending}>Cancelar</Button>
          <Button onClick={() => aprovarMut.mutate()} disabled={!doc || !email || !password || aprovarMut.isPending}>
            {aprovarMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-slate-800 ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</div>
    </div>
  );
}
