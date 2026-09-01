"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { NfeAprovacaoDialog } from "@/components/nfe/NfeAprovacaoDialog";
import { NfeCobrancaEditor } from "@/components/nfe/NfeCobrancaEditor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@/lib/api-action";
import { backendFetch } from "@/lib/backend";
import {
  getAlocacaoNfe,
  listCentrosCusto,
  listPlanoContas,
  listTiposMovimento,
  reavaliarStatusApontamentos,
  setAlocacoesCabecalho,
  setPlanoContasCabecalho,
  setTipoMovimentoFiscal,
  sugerirApontamentosFinanceiros,
} from "@/lib/client-actions";
import { somaAlocacoes, type CentroCustoAlocacao } from "@/lib/nfe-alocacao";
import type { NfseDetail, TotvsRunSummary } from "@/services/fiscalDocumentsService";

type NfseDocument = NfseDetail["document"];
type AllocationMode = "value" | "percentage";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const percentageOf = (value: number, total: number) =>
  total > 0 ? (Number(value || 0) / total) * 100 : 0;
const currency = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NfseTotvsPanel({
  document,
  latestRun,
}: {
  document: NfseDocument;
  latestRun: TotvsRunSummary | null;
}) {
  const queryClient = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [planId, setPlanId] = useState(document.plano_contas_id ?? "");
  const [allocations, setAllocations] = useState<CentroCustoAlocacao[]>([]);
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("value");
  const listPlans = useServerFn(listPlanoContas);
  const listCostCenters = useServerFn(listCentrosCusto);
  const getAllocation = useServerFn(getAlocacaoNfe);
  const setPlan = useServerFn(setPlanoContasCabecalho);
  const setAllocation = useServerFn(setAlocacoesCabecalho);
  const reevaluate = useServerFn(reavaliarStatusApontamentos);
  const suggest = useServerFn(sugerirApontamentosFinanceiros);
  const listMovementTypes = useServerFn(listTiposMovimento);
  const setMovementType = useServerFn(setTipoMovimentoFiscal);

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
  const movementTypes = useQuery<Array<{ id: string; codigo: string; descricao: string }>>({
    queryKey: ["tipos-movimento-documento", document.company_id, "nfse"],
    queryFn: () =>
      listMovementTypes({
        data: { companyId: document.company_id, tipoDocumento: "nfse", apenasVinculados: true },
      }),
  });

  useEffect(() => {
    if (!allocation.data) return;
    setAllocations(
      (allocation.data.cabecalho ?? []).map(
        (item: { centro_custo_id: string; valor: number | string }) => ({
          centro_custo_id: item.centro_custo_id,
          valor: Number(item.valor),
        }),
      ),
    );
  }, [allocation.data]);
  useEffect(() => setPlanId(document.plano_contas_id ?? ""), [document.plano_contas_id]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["nfse-detail", document.id] });
    queryClient.invalidateQueries({ queryKey: ["nfse-documents"] });
    queryClient.invalidateQueries({ queryKey: ["nfe-alocacao", document.id] });
  }, [document.id, queryClient]);

  const documentTotal = Number(document.valor_total ?? 0);
  const allocatedTotal = somaAlocacoes(allocations);
  const remaining = round2(documentTotal - allocatedTotal);
  const allocationClosed = Math.abs(remaining) <= 0.005;
  const costCenterOptions = (costCenters.data ?? []).map(
    (item: { id: string; codigo: string; descricao: string }) => ({
      value: item.id,
      label: `${item.codigo} · ${item.descricao}`,
    }),
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!planId) throw new Error("Selecione o Plano de Contas.");
      if (!allocations.length || allocations.some((item) => !item.centro_custo_id))
        throw new Error("Informe pelo menos um Centro de Custo válido no rateio.");
      if (new Set(allocations.map((item) => item.centro_custo_id)).size !== allocations.length)
        throw new Error("Cada Centro de Custo pode aparecer apenas uma vez no rateio.");
      if (!allocationClosed)
        throw new Error(
          `O rateio deve fechar o total da NFS-e (${currency(documentTotal)}). Restam ${currency(remaining)}.`,
        );
      await setPlan({
        data: { documentId: document.id, planoContasId: planId, sobrescreverItens: true },
      });
      await setAllocation({
        data: { documentId: document.id, alocacoes: allocations, propagarParaItens: false },
      });
      return reevaluate({ data: { documentId: document.id } });
    },
    onSuccess: () => {
      toast.success("Apontamentos da NFS-e salvos. O documento está pronto para integração.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const movement = useMutation({
    mutationFn: (tipoMovimentoId: string) =>
      setMovementType({ data: { documentId: document.id, tipoMovimentoId } }),
    onSuccess: () => {
      toast.success("Tipo de Movimento atualizado.");
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
    onSuccess: (result) => {
      toast.success("NFS-e enviada para a fila de integração TOTVS.");
      setActiveRunId(result.runId);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const integrationRun = useQuery({
    queryKey: ["totvs-integration-run", activeRunId],
    queryFn: () =>
      backendFetch<{ status: string; rm_record_id: string | null; error_message: string | null }>(
        `/totvs/integrate/run/${activeRunId}`,
      ),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "succeeded" || status === "failed" ? false : 1200;
    },
  });
  useEffect(() => {
    if (!activeRunId || !integrationRun.data) return;
    if (integrationRun.data.status === "succeeded") {
      toast.success(`NFS-e integrada no movimento RM ${integrationRun.data.rm_record_id}.`);
      refresh();
      setActiveRunId(null);
    } else if (integrationRun.data.status === "failed") {
      toast.error(
        integrationRun.data.error_message || "Não foi possível integrar a NFS-e no TOTVS.",
      );
      refresh();
      setActiveRunId(null);
    }
  }, [activeRunId, integrationRun.data, refresh]);
  const suggestion = useMutation({
    mutationFn: () => suggest({ data: { documentId: document.id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.info(result.message);
        return;
      }
      toast.success(
        `Sugestão aplicada com base na NFS-e ${result.sourceDocumentNumber}. Revise antes de integrar.`,
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editable = document.status === "aprovada" || document.status === "pronta_para_integracao";
  const alreadyExisting = document.status === "ja_existente_totvs";
  const integrated =
    document.status === "integrado_totvs" || alreadyExisting || latestRun?.status === "succeeded";

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
            Defina o movimento, o Plano de Contas e o rateio financeiro. O produto de serviço é o
            produto padrão configurado para esta empresa.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" /> Tipo de Movimento
            </Label>
            <SearchableSelect
              value={document.tipo_movimento_id ?? ""}
              onValueChange={(value) => movement.mutate(value)}
              options={(movementTypes.data ?? []).map((item) => ({
                value: item.id,
                label: `${item.codigo} · ${item.descricao}`,
              }))}
              placeholder="Selecione o Tipo de Movimento da NFS-e"
              disabled={!editable || integrated || movement.isPending}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label>Plano de Contas</Label>
            <SearchableSelect
              value={planId}
              onValueChange={setPlanId}
              options={(plans.data ?? []).map(
                (item: { id: string; codigo: string; descricao: string }) => ({
                  value: item.id,
                  label: `${item.codigo} · ${item.descricao}`,
                }),
              )}
              placeholder="Selecione a conta"
              disabled={!editable || save.isPending || integrated}
              className="w-full"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <Label className="text-base">Rateio de Centros de Custo</Label>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={allocationMode === "value" ? "default" : "outline"}
                    onClick={() => setAllocationMode("value")}
                    disabled={integrated}
                  >
                    R$ Valor
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={allocationMode === "percentage" ? "default" : "outline"}
                    onClick={() => setAllocationMode("percentage")}
                    disabled={integrated}
                  >
                    % Percentual
                  </Button>
                </div>
                <p className="text-sm text-slate-600">
                  <b>{currency(allocatedTotal)}</b> de {currency(documentTotal)} · Restante:{" "}
                  <b className={allocationClosed ? "text-emerald-700" : "text-amber-700"}>
                    {currency(remaining)}
                  </b>
                </p>
              </div>
            </div>

            {allocations.map((item, index) => (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_5rem_auto] sm:items-center"
              >
                <SearchableSelect
                  value={item.centro_custo_id}
                  onValueChange={(value) =>
                    setAllocations((current) =>
                      current.map((allocationItem, itemIndex) =>
                        itemIndex === index
                          ? { ...allocationItem, centro_custo_id: value }
                          : allocationItem,
                      ),
                    )
                  }
                  options={costCenterOptions}
                  placeholder="Selecione o Centro de Custo"
                  disabled={!editable || integrated || save.isPending}
                  className="w-full"
                />
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    className="pr-8 text-right"
                    value={
                      allocationMode === "percentage"
                        ? round2(percentageOf(item.valor, documentTotal))
                        : item.valor
                    }
                    disabled={!editable || integrated || save.isPending}
                    onChange={(event) => {
                      const inputValue = Number(event.target.value || 0);
                      const value =
                        allocationMode === "percentage"
                          ? round2((inputValue / 100) * documentTotal)
                          : inputValue;
                      setAllocations((current) =>
                        current.map((allocationItem, itemIndex) =>
                          itemIndex === index
                            ? { ...allocationItem, valor: value }
                            : allocationItem,
                        ),
                      );
                    }}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    {allocationMode === "percentage" ? "%" : "R$"}
                  </span>
                </div>
                <span className="text-right text-xs text-slate-500">
                  {allocationMode === "percentage"
                    ? currency(item.valor)
                    : `${round2(percentageOf(item.valor, documentTotal)).toFixed(2)}%`}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remover Centro de Custo do rateio"
                  disabled={!editable || integrated || save.isPending}
                  onClick={() =>
                    setAllocations((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}

            {editable && !integrated && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAllocations((current) => [
                    ...current,
                    {
                      centro_custo_id: costCenterOptions[0]?.value ?? "",
                      valor: current.length === 0 ? documentTotal : 0,
                    },
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Adicionar Centro de Custo
              </Button>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {editable && !integrated && (
              <NfeCobrancaEditor documentId={document.id} total={documentTotal} disabled={false} />
            )}
            {editable && !integrated && (
              <Button
                variant="outline"
                onClick={() => suggestion.mutate()}
                disabled={suggestion.isPending}
              >
                {suggestion.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Sugerir apontamentos
              </Button>
            )}
            {editable && !integrated && (
              <Button
                variant="outline"
                onClick={() => save.mutate()}
                disabled={!planId || !allocations.length || !allocationClosed || save.isPending}
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
          <AlertTitle>
            {alreadyExisting ? "NFS-e já existente no TOTVS" : "NFS-e integrada com sucesso"}
          </AlertTitle>
          <AlertDescription>
            {alreadyExisting
              ? "Documento reconciliado com o RM e disponível somente para visualização."
              : `Movimento RM: ${latestRun?.rm_record_id ?? "registrado"}.`}
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
