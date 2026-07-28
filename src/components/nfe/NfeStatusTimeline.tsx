import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { listStatusHistorico } from "@/lib/nfe-status.functions";
import { statusConfig } from "@/lib/nfe-status";

export function NfeStatusTimeline({ documentId }: { documentId: string }) {
  const listFn = useServerFn(listStatusHistorico);
  const { data = [], isLoading } = useQuery({
    queryKey: ["nfe-status-historico", documentId],
    queryFn: () => listFn({ data: { documentId } }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <CardTitle>Histórico de Status</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mudança de status registrada.</p>
        ) : (
          <div className="space-y-3">
            {(data as any[]).map((h) => {
              const novo = statusConfig(h.status_novo);
              const ant = h.status_anterior ? statusConfig(h.status_anterior) : null;
              return (
                <div key={h.id} className="flex flex-wrap items-center gap-2 rounded border border-muted bg-white p-3 shadow-sm">
                  <time className="font-mono text-xs text-primary w-40 shrink-0">
                    {new Date(h.alterado_em).toLocaleString("pt-BR")}
                  </time>
                  {ant && (
                    <>
                      <Badge variant="secondary" className={`border text-xs ${ant.badge}`}>{ant.label}</Badge>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </>
                  )}
                  <Badge variant="secondary" className={`border text-xs ${novo.badge}`}>{novo.label}</Badge>
                  <span className="text-xs text-slate-600">por <strong>{h.autor}</strong></span>
                  {h.observacao && <span className="text-xs text-slate-400 basis-full">{h.observacao}</span>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
