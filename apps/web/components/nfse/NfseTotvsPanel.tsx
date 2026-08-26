"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Save, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { NfeAprovacaoDialog } from "@/components/nfe/NfeAprovacaoDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@/lib/api-action";
import { backendFetch } from "@/lib/backend";
import {
  getAlocacaoNfe,
  listCentrosCusto,
  listPlanoContas,
  reavaliarStatusApontamentos,
  setAlocacoesCabecalho,
  setPlanoContasCabecalho,
} from "@/lib/client-actions";
import type { NfseDetail, TotvsRunSummary } from "@/services/fiscalDocumentsService";

type NfseDocument = NfseDetail["document"];

export function NfseTotvsPanel({
  document,
  latestRun,
}: {
  document: NfseDocument;
  latestRun: TotvsRunSummary | null;
}) {
  const queryClient = useQueryClient();
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [planId, setPlanId] = useState(document.plano_contas_id ?? "");
  const [costCenterId, setCostCenterId] = useState("");
  const listPlans = useServerFn(listPlanoContas);
  const listCostCenters = useServerFn(listCentrosCusto);
  const getAllocation = useServerFn(getAlocacaoNfe);
  const setPlan = useServerFn(setPlanoContasCabecalho);
  const setAllocation = useServerFn(setAlocacoesCabecalho);
  const reevaluate = useServerFn(reavaliarStatusApontamentos);

  const plans = useQuery({
    queryKey: ["plano-contas-lanc", document.company_id],
    queryFn: () =>
      listPlans({
        data: { companyId: document.company_id, apenasLancaveis: true, apenasAtivos: true },
      }),
  });
  const costCenters = useQuery({
    queryKey: ["ccs-ativos", document.company_id],
    queryFn: () =>
      listCostCenters({ data: { companyId: document.company_id, apenasAtivos: true } }),
  });
  const allocation = useQuery({
    queryKey: ["nfe-alocacao", document.id],
    queryFn: () => getAllocation({ data: { documentId: document.id } }),
  });

  useEffect(() => {
    const first = allocation.data?.cabecalho?.[0];
    if (first?.centro_custo_id) setCostCenterId(first.centro_custo_id);
  }, [allocation.data]);
  useEffect(() => setPlanId(document.plano_contas_id ?? ""), [document.plano_contas_id]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["nfse-detail", document.id] });
    queryClient.invalidateQueries({ queryKey: ["nfse-documents"] });
    queryClient.invalidateQueries({ queryKey: ["nfe-alocacao", document.id] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!planId || !costCenterId)
        throw new Error("Selecione o Plano de Contas e o Centro de Custo.");
      await setPlan({
        data: { documentId: document.id, planoContasId: planId, sobrescreverItens: true },
      });
      await setAllocation({
        data: {
          documentId: document.id,
          alocacoes: [{ centro_custo_id: costCenterId, valor: Number(document.valor_total ?? 0) }],
          propagarParaItens: false,
        },
      });
      return reevaluate({ data: { documentId: document.id } });
    },
    onSuccess: () => {
      toast.success("Apontamentos da NFS-e salvos. O documento está pronto para integração.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const integrate = useMutation({
    mutationFn: () =>
      backendFetch<{ runId: string; status: string; idempotent: boolean }>(
        `/totvs/integrate/${document.id}`,
        { method: "POST" },
      ),
    onSuccess: () => {
      toast.success("NFS-e enviada para a fila de integração TOTVS.");
      refresh();
      window.setTimeout(refresh, 1800);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editable = document.status === "aprovada" || document.status === "pronta_para_integracao";
  const integrated = document.status === "integrado_totvs" || latestRun?.status === "succeeded";

  return (
    <div className="space-y-4">
      {document.status === "pendente_confirmacao" && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Aprovação necessária</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Revise a NFS-e e confirme sua identidade antes de realizar os apontamentos.</span>
            <Button size="sm" onClick={() => setApprovalOpen(true)}>
              Aprovar NFS-e
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Apontamentos para o TOTVS RM</CardTitle>
          <p className="text-sm text-slate-500">
            Serviços exigem Plano de Contas e Centro de Custo. O produto de serviço e o movimento
            são definidos pela conexão TOTVS.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Plano de Contas</Label>
              <Select
                value={planId}
                onValueChange={setPlanId}
                disabled={!editable || save.isPending || integrated}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {(plans.data ?? []).map(
                    (item: { id: string; codigo: string; descricao: string }) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.codigo} · {item.descricao}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Centro de Custo</Label>
              <Select
                value={costCenterId}
                onValueChange={setCostCenterId}
                disabled={!editable || save.isPending || integrated}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o centro" />
                </SelectTrigger>
                <SelectContent>
                  {(costCenters.data ?? []).map(
                    (item: { id: string; codigo: string; descricao: string }) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.codigo} · {item.descricao}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {editable && !integrated && (
              <Button
                variant="outline"
                onClick={() => save.mutate()}
                disabled={!planId || !costCenterId || save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar apontamentos
              </Button>
            )}
            {(document.status === "pronta_para_integracao" || latestRun?.status === "failed") &&
              !integrated && (
                <Button
                  onClick={() => integrate.mutate()}
                  disabled={integrate.isPending || save.isPending}
                >
                  {integrate.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {latestRun?.status === "failed" ? "Tentar novamente" : "Integrar no TOTVS"}
                </Button>
              )}
          </div>
        </CardContent>
      </Card>

      {integrated && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>NFS-e integrada com sucesso</AlertTitle>
          <AlertDescription>
            Movimento RM: {latestRun?.rm_record_id ?? "registrado"}.
          </AlertDescription>
        </Alert>
      )}

      <NfeAprovacaoDialog
        documentId={document.id}
        documentType="NFS-e"
        invalidateQueryKey={["nfse-detail", document.id]}
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
      />
    </div>
  );
}
