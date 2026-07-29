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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Loader2, BookOpen, Wallet, Save, Warehouse, Tags, RotateCcw } from "lucide-react";
import { listPlanoContas } from "@/lib/plano-contas.functions";
import { listCentrosCusto } from "@/lib/centros-custo.functions";
import { listLocaisEstoque } from "@/lib/locais-estoque.functions";
import { listTiposCompra } from "@/lib/tipos-compra.functions";
import { getAlocacaoNfe, setPlanoContasCabecalho, setPlanoContasItem, setAlocacoesCabecalho, setAlocacoesItem, setLocalEstoqueCabecalho, setLocalEstoqueItem, setTipoCompraCabecalho, setTipoCompraItem, restaurarTipoCompraItem } from "@/lib/nfe-alocacao.functions";
import { recalcularAlocacaoCabecalho, somaAlocacoes, type CentroCustoAlocacao } from "@/lib/nfe-alocacao";
import { consolidarTipoCompra, labelTipoCompra, type TipoCompra } from "@/lib/nfe-tipo-compra";


const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ProgressoApontamento({ apontados, total, faltanteLabel }: { apontados: number; total: number; faltanteLabel: string }) {
  const pct = total > 0 ? (apontados / total) * 100 : 0;
  const faltantes = Math.max(0, total - apontados);
  return (
    <div className="space-y-1 max-w-xl">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Progresso do apontamento</span>
        <b>{apontados}/{total} itens apontados</b>
      </div>
      <Progress value={pct} className="h-2" />
      {faltantes > 0 && (
        <p className="text-xs font-medium text-amber-700">
          Existem {faltantes} item(ns) sem {faltanteLabel} apontado. Realize o apontamento antes de prosseguir.
        </p>
      )}
    </div>
  );
}

export function NfeFinanceiro({ doc, items, readOnly = false }: { doc: any; items: any[]; readOnly?: boolean }) {
  const qc = useQueryClient();
  const companyId = doc.company_id as string;
  const documentId = doc.id as string;
  const valorTotal = Number(doc.valor_total || 0);

  const listPCFn = useServerFn(listPlanoContas);
  const listCCFn = useServerFn(listCentrosCusto);
  const listLEFn = useServerFn(listLocaisEstoque);
  const setLEHeaderFn = useServerFn(setLocalEstoqueCabecalho);
  const setLEItemFn = useServerFn(setLocalEstoqueItem);
  const getAlocFn = useServerFn(getAlocacaoNfe);
  const setPCHeaderFn = useServerFn(setPlanoContasCabecalho);
  const setPCItemFn = useServerFn(setPlanoContasItem);
  const setCabFn = useServerFn(setAlocacoesCabecalho);
  const setItemFn = useServerFn(setAlocacoesItem);
  const listTCFn = useServerFn(listTiposCompra);
  const setTCHeaderFn = useServerFn(setTipoCompraCabecalho);
  const setTCItemFn = useServerFn(setTipoCompraItem);
  const restaurarTCFn = useServerFn(restaurarTipoCompraItem);

  const { data: planos = [] } = useQuery({
    queryKey: ["plano-contas-lanc", companyId],
    queryFn: () => listPCFn({ data: { companyId, apenasLancaveis: true, apenasAtivos: true } }),
  });
  const { data: ccs = [] } = useQuery({
    queryKey: ["ccs-ativos", companyId],
    queryFn: () => listCCFn({ data: { companyId, apenasAtivos: true } }),
  });
  const { data: locais = [] } = useQuery({
    queryKey: ["locais-estoque-ativos", companyId],
    queryFn: () => listLEFn({ data: { companyId, apenasAtivos: true } }),
  });
  const { data: tiposCompra = [] } = useQuery<TipoCompra[]>({
    queryKey: ["tipos-compra"],
    queryFn: () => listTCFn() as any,
    staleTime: 60 * 60 * 1000,
  });

  const { data: alocacao } = useQuery({
    queryKey: ["nfe-alocacao", documentId],
    queryFn: () => getAlocFn({ data: { documentId } }),
  });

  const [confirmSobrescrever, setConfirmSobrescrever] = useState<string | null>(null);
  const [confirmSobrescreverLE, setConfirmSobrescreverLE] = useState<string | null>(null);
  const [confirmSobrescreverTC, setConfirmSobrescreverTC] = useState<string | null>(null);

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

  const setLEHeaderMut = useMutation({
    mutationFn: (v: { localEstoqueId: string | null; sobrescreverItens: boolean }) =>
      setLEHeaderFn({ data: { documentId, localEstoqueId: v.localEstoqueId, sobrescreverItens: v.sobrescreverItens } }),
    onSuccess: () => {
      toast.success("Local de Estoque atualizado no cabeçalho e propagado para os itens.");
      qc.invalidateQueries({ queryKey: ["nfe-details", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLEItemMut = useMutation({
    mutationFn: (v: { itemId: string; localEstoqueId: string | null }) => setLEItemFn({ data: v }),
    onSuccess: () => {
      toast.success("Local de Estoque do item atualizado.");
      qc.invalidateQueries({ queryKey: ["nfe-details", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const setTCHeaderMut = useMutation({
    mutationFn: (v: { tipoCompraId: string | null; sobrescreverItens: boolean }) =>
      setTCHeaderFn({ data: { documentId, tipoCompraId: v.tipoCompraId, sobrescreverItens: v.sobrescreverItens } }),
    onSuccess: () => {
      toast.success("Tipo de Compra atualizado no cabeçalho e propagado para os itens.");
      qc.invalidateQueries({ queryKey: ["nfe-details", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTCItemMut = useMutation({
    mutationFn: (v: { itemId: string; tipoCompraId: string | null }) => setTCItemFn({ data: v }),
    onSuccess: () => {
      toast.success("Tipo de Compra do item atualizado (marcado como alteração manual).");
      qc.invalidateQueries({ queryKey: ["nfe-details", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restaurarTCMut = useMutation({
    mutationFn: (itemId: string) => restaurarTCFn({ data: { itemId } }),
    onSuccess: () => {
      toast.success("Tipo de Compra do item restaurado para o padrão do cabeçalho.");
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

  function alterarLECabecalho(newId: string | null) {
    const algumItemManual = items.some((it) => it.local_estoque_alterado_manualmente);
    if (algumItemManual) {
      setConfirmSobrescreverLE(newId ?? "");
      return;
    }
    setLEHeaderMut.mutate({ localEstoqueId: newId, sobrescreverItens: false });
  }

  function alterarTCCabecalho(newId: string | null) {
    const algumItemManual = items.some((it) => it.tipo_compra_alterado_manualmente);
    if (algumItemManual) {
      setConfirmSobrescreverTC(newId ?? "");
      return;
    }
    setTCHeaderMut.mutate({ tipoCompraId: newId, sobrescreverItens: false });
  }

  const tcById = useMemo(
    () => new Map((tiposCompra as TipoCompra[]).map((t) => [t.id, t])),
    [tiposCompra],
  );
  const consolidacaoTC = useMemo(
    () => consolidarTipoCompra(items.map((it) => ({ id: it.id, tipo_compra_id: it.tipo_compra_id ?? null }))),
    [items],
  );
  const progressoTC = consolidacaoTC.total > 0 ? (consolidacaoTC.apontados / consolidacaoTC.total) * 100 : 0;

  const totalItens = items.length;
  const apontadosPC = useMemo(() => items.filter((it) => !!it.plano_contas_id).length, [items]);
  const apontadosLE = useMemo(() => items.filter((it) => !!it.local_estoque_id).length, [items]);
  const apontadosCC = useMemo(
    () => items.filter((it) => {
      const vTot = Number(it.valor_bruto || 0);
      const soma = somaAlocacoes(itemAllocs[it.id] ?? []);
      return vTot > 0 ? soma >= vTot - 0.005 : soma > 0;
    }).length,
    [items, itemAllocs],
  );


  const ccOptions = (ccs as any[]);
  const leOptions = (locais as any[]).filter((l) => l.tipo === "analitico");


  function addCabRow() { setCabAllocs((p) => [...p, { centro_custo_id: (ccOptions[0]?.id ?? ""), valor: 0 }]); }
  function addItemRow(itemId: string) {
    setItemAllocs((p) => ({ ...p, [itemId]: [...(p[itemId] ?? []), { centro_custo_id: (ccOptions[0]?.id ?? ""), valor: 0 }] }));
  }

  const previewCab = useMemo(() => recalcularAlocacaoCabecalho(
    items.map((it) => ({ id: it.id, valor_bruto: Number(it.valor_bruto || 0), alocacoes: itemAllocs[it.id] ?? [] })),
  ), [items, itemAllocs]);

  const aviso =
    doc.status === "integrado_totvs"
      ? "NF-e já integrada na TOTVS. Os apontamentos estão encerrados e não podem mais ser alterados."
      : "Esta NF-e precisa ser aprovada antes de realizar os apontamentos.";

  return (
    <div className="space-y-6">
      {readOnly && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {aviso}
        </div>
      )}
      <fieldset disabled={readOnly} className={readOnly ? "space-y-6 opacity-60" : "space-y-6"}>
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
          <ProgressoApontamento apontados={apontadosPC} total={totalItens} faltanteLabel="Plano de Contas" />
          <p className="text-xs text-slate-500">Ao alterar, o Plano de Contas é propagado para todos os itens (exceto os alterados manualmente).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tags className="h-4 w-4 text-primary" />
            <CardTitle className="text-lg">Tipo de Compra (cabeçalho)</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            {consolidacaoTC.multiplos ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Badge variant="outline" className="cursor-pointer bg-violet-50 text-violet-700 border-violet-200">
                    Múltiplos tipos
                  </Badge>
                </PopoverTrigger>
                <PopoverContent className="w-72">
                  <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Distribuição por item</p>
                  <ul className="text-sm space-y-1">
                    {consolidacaoTC.distribuicao.map((d) => (
                      <li key={d.tipo_compra_id ?? "__none__"}>
                        {d.quantidade} {d.quantidade === 1 ? "item" : "itens"} ·{" "}
                        {d.tipo_compra_id ? labelTipoCompra(tcById.get(d.tipo_compra_id)) : "sem Tipo de Compra"}
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            ) : consolidacaoTC.unico ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                {labelTipoCompra(tcById.get(consolidacaoTC.unico))}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-xl">
                  <Select
                    disabled={readOnly}
                    value={doc.tipo_compra_id ?? "__none__"}
                    onValueChange={(v) => alterarTCCabecalho(v === "__none__" ? null : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione um Tipo de Compra" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— sem tipo de compra —</SelectItem>
                      {(tiposCompra as TipoCompra[]).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.codigo} - {t.descricao}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              {readOnly && <TooltipContent>{aviso}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Progresso do apontamento</span>
              <b>{consolidacaoTC.apontados}/{consolidacaoTC.total} itens apontados</b>
            </div>
            <Progress value={progressoTC} className="h-2" />
          </div>
          {consolidacaoTC.faltantes > 0 && (
            <p className="text-xs font-medium text-amber-700">
              Existem {consolidacaoTC.faltantes} item(ns) sem Tipo de Compra apontado. Realize o apontamento antes de prosseguir.
            </p>
          )}
          <p className="text-xs text-slate-500">Ao alterar, o Tipo de Compra é propagado para todos os itens (exceto os alterados manualmente).</p>
        </CardContent>
      </Card>



      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Warehouse className="h-4 w-4 text-primary" />
          <CardTitle className="text-lg">Local de Estoque (cabeçalho)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={doc.local_estoque_id ?? "__none__"} onValueChange={(v) => alterarLECabecalho(v === "__none__" ? null : v)}>
            <SelectTrigger className="max-w-xl"><SelectValue placeholder="Selecione um Local de Estoque" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— sem local de estoque —</SelectItem>
              {leOptions.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.codigo} · {l.descricao}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ProgressoApontamento apontados={apontadosLE} total={totalItens} faltanteLabel="Local de Estoque" />
          <p className="text-xs text-slate-500">Somente locais analíticos (99.999) podem ser usados. Ao alterar, o Local de Estoque é propagado para todos os itens (exceto os alterados manualmente).</p>
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
                    <div className="w-64">
                      <Select
                        value={it.local_estoque_id ?? "__none__"}
                        onValueChange={(v) => setLEItemMut.mutate({ itemId: it.id, localEstoqueId: v === "__none__" ? null : v })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Local de Estoque do item" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— herdar do cabeçalho —</SelectItem>
                          {leOptions.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.codigo} · {l.descricao}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {it.local_estoque_alterado_manualmente && <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">estoque manual</Badge>}
                    <div className="w-64">
                      <Select
                        value={it.tipo_compra_id ?? "__none__"}
                        onValueChange={(v) => setTCItemMut.mutate({ itemId: it.id, tipoCompraId: v === "__none__" ? null : v })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo de Compra do item" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— herdar do cabeçalho —</SelectItem>
                          {(tiposCompra as TipoCompra[]).map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.codigo} - {t.descricao}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {it.tipo_compra_alterado_manualmente && (
                      <>
                        <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">tipo manual</Badge>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => restaurarTCMut.mutate(it.id)}>
                                <RotateCcw className="h-4 w-4 text-slate-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Restaurar padrão do cabeçalho</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    )}

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

      <AlertDialog open={confirmSobrescreverLE !== null} onOpenChange={(o) => !o && setConfirmSobrescreverLE(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sobrescrever alterações manuais?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso substituirá o Local de Estoque já definido manualmente em algum item. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const id = confirmSobrescreverLE;
              setConfirmSobrescreverLE(null);
              setLEHeaderMut.mutate({ localEstoqueId: id === "" ? null : id, sobrescreverItens: true });
            }}>Sobrescrever</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSobrescreverTC !== null} onOpenChange={(o) => !o && setConfirmSobrescreverTC(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sobrescrever alterações manuais?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso substituirá o Tipo de Compra já definido manualmente em algum item. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const id = confirmSobrescreverTC;
              setConfirmSobrescreverTC(null);
              setTCHeaderMut.mutate({ tipoCompraId: id === "" ? null : id, sobrescreverItens: true });
            }}>Sobrescrever</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </fieldset>

    </div>
  );
}
