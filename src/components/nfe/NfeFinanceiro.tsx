import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Loader2, BookOpen, Wallet, Save } from "lucide-react";
import { listPlanoContas } from "@/lib/plano-contas.functions";
import { listCentrosCusto } from "@/lib/centros-custo.functions";
import { getAlocacaoNfe, setPlanoContasCabecalho, setPlanoContasItem, setAlocacoesCabecalho, setAlocacoesItem } from "@/lib/nfe-alocacao.functions";
import { recalcularAlocacaoCabecalho, somaAlocacoes, type CentroCustoAlocacao } from "@/lib/nfe-alocacao";

const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NfeFinanceiro({ doc, items }: { doc: any; items: any[] }) {
  const qc = useQueryClient();
  const companyId = doc.company_id as string;
  const documentId = doc.id as string;
  const valorTotal = Number(doc.valor_total || 0);

  const listPCFn = useServerFn(listPlanoContas);
  const listCCFn = useServerFn(listCentrosCusto);
  const getAlocFn = useServerFn(getAlocacaoNfe);
  const setPCHeaderFn = useServerFn(setPlanoContasCabecalho);
  const setPCItemFn = useServerFn(setPlanoContasItem);
  const setCabFn = useServerFn(setAlocacoesCabecalho);
  const setItemFn = useServerFn(setAlocacoesItem);

  const { data: planos = [] } = useQuery({
    queryKey: ["plano-contas-lanc", companyId],
    queryFn: () => listPCFn({ data: { companyId, apenasLancaveis: true, apenasAtivos: true } }),
  });
  const { data: ccs = [] } = useQuery({
    queryKey: ["ccs-ativos", companyId],
    queryFn: () => listCCFn({ data: { companyId, apenasAtivos: true } }),
  });
  const { data: alocacao } = useQuery({
    queryKey: ["nfe-alocacao", documentId],
    queryFn: () => getAlocFn({ data: { documentId } }),
  });

  const [confirmSobrescrever, setConfirmSobrescrever] = useState<string | null>(null);
  const [cabAllocs, setCabAllocs] = useState<CentroCustoAlocacao[]>([]);
  const [itemAllocs, setItemAllocs] = useState<Record<string, CentroCustoAlocacao[]>>({});

  useEffect(() => {
    if (!alocacao) return;
    setCabAllocs((alocacao.cabecalho as any[]).map((r) => ({ centro_custo_id: r.centro_custo_id, valor: Number(r.valor) })));
    const map: Record<string, CentroCustoAlocacao[]> = {};
    for (const it of items) map[it.id] = [];
    for (const r of alocacao.itens as any[]) {
      (map[r.document_item_id] ??= []).push({ centro_custo_id: r.centro_custo_id, valor: Number(r.valor) });
    }
    setItemAllocs(map);
  }, [alocacao, items]);

  const totalAlocadoCab = somaAlocacoes(cabAllocs);
  const restante = Math.max(0, valorTotal - totalAlocadoCab);

  const setPCHeaderMut = useMutation({
    mutationFn: (v: { planoContasId: string | null; sobrescreverItens: boolean }) =>
      setPCHeaderFn({ data: { documentId, planoContasId: v.planoContasId, sobrescreverItens: v.sobrescreverItens } }),
    onSuccess: () => {
      toast.success("Plano de Contas atualizado no cabeçalho e propagado para os itens.");
      qc.invalidateQueries({ queryKey: ["nfe-details", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPCItemMut = useMutation({
    mutationFn: (v: { itemId: string; planoContasId: string | null }) => setPCItemFn({ data: v }),
    onSuccess: () => {
      toast.success("Plano de Contas do item atualizado (marcado como alteração manual).");
      qc.invalidateQueries({ queryKey: ["nfe-details", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCabMut = useMutation({
    mutationFn: (propagar: boolean) => setCabFn({ data: { documentId, alocacoes: cabAllocs, propagarParaItens: propagar } }),
    onSuccess: () => {
      toast.success("Rateio do cabeçalho salvo.");
      qc.invalidateQueries({ queryKey: ["nfe-alocacao", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveItemMut = useMutation({
    mutationFn: (itemId: string) => setItemFn({ data: { itemId, alocacoes: itemAllocs[itemId] ?? [] } }),
    onSuccess: () => {
      toast.success("Rateio do item salvo. Cabeçalho consolidado automaticamente.");
      qc.invalidateQueries({ queryKey: ["nfe-alocacao", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function alterarPCCabecalho(newId: string | null) {
    const algumItemManual = items.some((it) => it.plano_contas_alterado_manualmente);
    if (algumItemManual) {
      setConfirmSobrescrever(newId ?? "");
      return;
    }
    setPCHeaderMut.mutate({ planoContasId: newId, sobrescreverItens: false });
  }

  const ccOptions = (ccs as any[]);

  function addCabRow() { setCabAllocs((p) => [...p, { centro_custo_id: (ccOptions[0]?.id ?? ""), valor: 0 }]); }
  function addItemRow(itemId: string) {
    setItemAllocs((p) => ({ ...p, [itemId]: [...(p[itemId] ?? []), { centro_custo_id: (ccOptions[0]?.id ?? ""), valor: 0 }] }));
  }

  const previewCab = useMemo(() => recalcularAlocacaoCabecalho(
    items.map((it) => ({ id: it.id, valor_bruto: Number(it.valor_bruto || 0), alocacoes: itemAllocs[it.id] ?? [] })),
  ), [items, itemAllocs]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <CardTitle className="text-lg">Plano de Contas (cabeçalho)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={doc.plano_contas_id ?? "__none__"} onValueChange={(v) => alterarPCCabecalho(v === "__none__" ? null : v)}>
            <SelectTrigger className="max-w-xl"><SelectValue placeholder="Selecione um Plano de Contas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— sem plano de contas —</SelectItem>
              {(planos as any[]).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.codigo} · {p.descricao}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">Ao alterar, o Plano de Contas é propagado para todos os itens (exceto os alterados manualmente).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /><CardTitle className="text-lg">Rateio de Centros de Custo — Cabeçalho</CardTitle></div>
          <div className="text-sm">
            <span className="text-slate-500">Total alocado:</span> <b>{fmt(totalAlocadoCab)}</b> {" / "}
            <span className="text-slate-500">Total NF-e:</span> <b>{fmt(valorTotal)}</b> {" / "}
            <span className="text-slate-500">Restante:</span> <b className={restante < 0 ? "text-red-600" : ""}>{fmt(restante)}</b>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {cabAllocs.map((a, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select value={a.centro_custo_id} onValueChange={(v) => setCabAllocs((p) => p.map((x, i) => i === idx ? { ...x, centro_custo_id: v } : x))}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ccOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} · {c.descricao}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="number" step="0.01" min={0} className="w-40 text-right"
                value={a.valor}
                onChange={(e) => {
                  const v = Number(e.target.value || 0);
                  setCabAllocs((p) => p.map((x, i) => i === idx ? { ...x, valor: v } : x));
                }}
              />
              <Button size="icon" variant="ghost" onClick={() => setCabAllocs((p) => p.filter((_, i) => i !== idx))}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={addCabRow}><Plus className="h-4 w-4 mr-1" /> Adicionar Centro de Custo</Button>
            <Button size="sm" onClick={() => saveCabMut.mutate(false)} disabled={saveCabMut.isPending || totalAlocadoCab > valorTotal + 0.005}>
              {saveCabMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Salvar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => saveCabMut.mutate(true)} disabled={saveCabMut.isPending || totalAlocadoCab > valorTotal + 0.005}>
              Salvar e distribuir proporcionalmente nos itens
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <CardTitle className="text-lg">Rateio por Item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {items.map((it) => {
            const rateio = itemAllocs[it.id] ?? [];
            const somaItem = somaAlocacoes(rateio);
            const vTot = Number(it.valor_bruto || 0);
            const disponivel = Math.max(0, vTot - somaItem);
            return (
              <div key={it.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">#{it.numero_item} · {it.descricao}</p>
                    <p className="text-xs text-slate-500">Item: <b>{fmt(vTot)}</b> · Alocado: <b>{fmt(somaItem)}</b> · Disponível: <b className={disponivel < 0 ? "text-red-600" : ""}>{fmt(disponivel)}</b></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-64">
                      <Select
                        value={it.plano_contas_id ?? "__none__"}
                        onValueChange={(v) => setPCItemMut.mutate({ itemId: it.id, planoContasId: v === "__none__" ? null : v })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Plano de Contas do item" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— herdar do cabeçalho —</SelectItem>
                          {(planos as any[]).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.codigo} · {p.descricao}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {it.plano_contas_alterado_manualmente && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">manual</Badge>}
                  </div>
                </div>
                {rateio.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={a.centro_custo_id} onValueChange={(v) => setItemAllocs((p) => ({ ...p, [it.id]: (p[it.id] ?? []).map((x, i) => i === idx ? { ...x, centro_custo_id: v } : x) }))}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ccOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} · {c.descricao}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="0.01" min={0} max={vTot} className="w-40 text-right"
                      value={a.valor}
                      onChange={(e) => {
                        let v = Number(e.target.value || 0);
                        const outros = (itemAllocs[it.id] ?? []).reduce((s, x, i) => s + (i === idx ? 0 : Number(x.valor || 0)), 0);
                        if (v + outros > vTot) v = Math.max(0, vTot - outros);
                        setItemAllocs((p) => ({ ...p, [it.id]: (p[it.id] ?? []).map((x, i) => i === idx ? { ...x, valor: v } : x) }));
                      }}
                      onBlur={() => {
                        if (somaItem < vTot - 0.005) {
                          toast.warning(`Item "${it.descricao}" tem ${fmt(vTot - somaItem)} do valor total ainda sem Centro de Custo alocado.`);
                        }
                      }}
                    />
                    <Button size="icon" variant="ghost" onClick={() => setItemAllocs((p) => ({ ...p, [it.id]: (p[it.id] ?? []).filter((_, i) => i !== idx) }))}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => addItemRow(it.id)}><Plus className="h-4 w-4 mr-1" /> Adicionar Centro</Button>
                  <Button size="sm" onClick={() => saveItemMut.mutate(it.id)} disabled={saveItemMut.isPending || somaItem > vTot + 0.005}>
                    {saveItemMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Salvar item
                  </Button>
                </div>
              </div>
            );
          })}

          {previewCab.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Prévia consolidada do cabeçalho (baseada nos itens)</p>
              <ul className="text-sm space-y-1">
                {previewCab.map((c) => {
                  const cc = ccOptions.find((x: any) => x.id === c.centro_custo_id);
                  return <li key={c.centro_custo_id}><b>{cc?.codigo ?? "?"}</b> {cc?.descricao ?? ""}: {fmt(c.valor)}</li>;
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmSobrescrever !== null} onOpenChange={(o) => !o && setConfirmSobrescrever(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sobrescrever alterações manuais?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso substituirá o Plano de Contas já definido manualmente em algum item. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const id = confirmSobrescrever;
              setConfirmSobrescrever(null);
              setPCHeaderMut.mutate({ planoContasId: id === "" ? null : id, sobrescreverItens: true });
            }}>Sobrescrever</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
