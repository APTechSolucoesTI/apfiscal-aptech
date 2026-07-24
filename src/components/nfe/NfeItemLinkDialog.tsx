import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Package, Search, Sparkles, Link2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maskCnpjCpf } from "@/lib/br-format";

import {
  getNfeItemLinkContext,
  searchProductsForLink,
  linkNfeItemToProduct,
  createProductAndLinkItem,
  getNextProductCode,
  type ProdutoInput,
} from "@/lib/products.functions";
import { listClassifications } from "@/lib/classifications.functions";

const ORIGENS = [
  { v: 0, label: "0 - Nacional" },
  { v: 1, label: "1 - Estrangeira (importação direta)" },
  { v: 2, label: "2 - Estrangeira (mercado interno)" },
  { v: 3, label: "3 - Nacional (>40% importado)" },
  { v: 4, label: "4 - Nacional (processos básicos)" },
  { v: 5, label: "5 - Nacional (até 40% importado)" },
  { v: 6, label: "6 - Estrangeira sem similar (imp. direta)" },
  { v: 7, label: "7 - Estrangeira sem similar (merc. interno)" },
  { v: 8, label: "8 - Nacional (>70% importado)" },
];

interface Props {
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

export function NfeItemLinkDialog({ itemId, open, onOpenChange, onLinked }: Props) {
  const qc = useQueryClient();
  const ctxFn = useServerFn(getNfeItemLinkContext);
  const searchFn = useServerFn(searchProductsForLink);
  const linkFn = useServerFn(linkNfeItemToProduct);
  const createLinkFn = useServerFn(createProductAndLinkItem);
  const listClass = useServerFn(listClassifications);
  const nextCodeFn = useServerFn(getNextProductCode);

  const { data: ctx, isLoading: loadingCtx } = useQuery({
    queryKey: ["nfe-item-link-context", itemId],
    queryFn: () => ctxFn({ data: { itemId: itemId! } }),
    enabled: !!itemId && open,
  });

  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [newForm, setNewForm] = useState<ProdutoInput>({
    company_id: null,
    codigo_interno: "",
    descricao: "",
    unidade: "UN",
    ncm: "",
    origem_mercadoria: 0,
    ativo: true,
  });

  const companyId = ctx?.document?.company_id ?? null;
  const classScope = companyId ?? undefined;

  useEffect(() => {
    if (!ctx?.item) return;
    setNewForm((f) => ({
      ...f,
      company_id: companyId,
      descricao: (ctx.item as any).descricao ?? "",
      unidade: (ctx.item as any).unidade_comercial ?? "UN",
      ncm: String((ctx.item as any).ncm ?? "").replace(/\D/g, "").slice(0, 8),
    }));
    setSelectedProductId(null);
    setTab("existing");
    setSearch("");
  }, [ctx?.item?.id, companyId]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["nfe-link-search", companyId, debounced],
    queryFn: () => searchFn({ data: { companyId, query: debounced } }),
    enabled: open && tab === "existing",
  });

  const { data: familias = [] } = useQuery({
    queryKey: ["classif", "familias", classScope],
    queryFn: () => listClass({ data: { tabela: "familias", companyId: classScope } }),
    enabled: open && tab === "new",
  });
  const { data: grupos = [] } = useQuery({
    queryKey: ["classif", "grupos", classScope],
    queryFn: () => listClass({ data: { tabela: "grupos", companyId: classScope } }),
    enabled: open && tab === "new",
  });
  const { data: subgrupos = [] } = useQuery({
    queryKey: ["classif", "subgrupos", classScope],
    queryFn: () => listClass({ data: { tabela: "subgrupos", companyId: classScope } }),
    enabled: open && tab === "new",
  });

  const linkMut = useMutation({
    mutationFn: () => linkFn({ data: { itemId: itemId!, produtoId: selectedProductId! } }),
    onSuccess: () => {
      const p = (results as any[]).find((r) => r.id === selectedProductId);
      toast.success(`Item vinculado ao produto ${p?.codigo_interno ?? ""} - ${p?.descricao ?? ""}`);
      qc.invalidateQueries({ queryKey: ["nfe-details"] });
      onLinked();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () => createLinkFn({ data: { itemId: itemId!, produto: newForm } }),
    onSuccess: (r) => {
      toast.success(`Produto ${r.codigo_interno} criado e vinculado com sucesso`);
      qc.invalidateQueries({ queryKey: ["nfe-details"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      onLinked();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const item = ctx?.item as any;
  const supplier = ctx?.supplier;
  const conflicting = ctx?.conflictingLink;

  const showConflictWarn = useMemo(() => {
    if (!conflicting || !selectedProductId) return false;
    return conflicting.produto_id !== selectedProductId;
  }, [conflicting, selectedProductId]);

  function handleConfirmLink() {
    if (!selectedProductId) return;
    if (showConflictWarn) {
      const ok = window.confirm(
        `Atenção: este fornecedor já possui o código "${item?.codigo}" vinculado ao produto "${conflicting?.codigo_interno} - ${conflicting?.descricao}". Deseja substituir o vínculo?`,
      );
      if (!ok) return;
    }
    linkMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" /> Vincular Item da NF-e a Produto
          </DialogTitle>
          <DialogDescription>
            Vincule este item da nota a um produto existente ou crie um novo produto a partir dos dados da nota.
          </DialogDescription>
        </DialogHeader>

        {loadingCtx || !ctx ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            {/* Cabeçalho fixo com dados do item */}
            <Card className="mx-6 mt-4 border-amber-200 bg-amber-50/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-semibold text-amber-800">Item da NF-e (referência)</span>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">Pendente de Vínculo</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Descrição</p>
                    <p className="font-medium">{item?.descricao ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Código na Nota</p>
                    <p className="font-mono">{item?.codigo ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">NCM</p>
                    <p className="font-mono">{item?.ncm ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unidade</p>
                    <p>{item?.unidade_comercial ?? "-"}</p>
                  </div>
                  <div className="col-span-3">
                    <p className="text-xs text-muted-foreground">Fornecedor (Emitente)</p>
                    <p className="font-medium">
                      {supplier
                        ? `${supplier.razao_social} — ${maskCnpjCpf(supplier.cnpj_cpf)}`
                        : ctx.document.emitente_nome
                          ? `${ctx.document.emitente_nome} — ${maskCnpjCpf(ctx.document.emitente_cnpj ?? "")} (não cadastrado)`
                          : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col overflow-hidden mt-4">
              <TabsList className="mx-6 justify-start">
                <TabsTrigger value="existing"><Search className="h-4 w-4 mr-1" /> Vincular a Produto Existente</TabsTrigger>
                <TabsTrigger value="new"><Sparkles className="h-4 w-4 mr-1" /> Criar Novo Produto</TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="flex-1 overflow-hidden flex flex-col mt-3 mx-6">
                <div className="relative mb-3">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    autoFocus
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por código interno, descrição, NCM ou EAN..."
                  />
                </div>
                {conflicting && (
                  <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <div>
                      Este fornecedor já possui o código <span className="font-mono">{item?.codigo}</span> vinculado ao produto{" "}
                      <strong>{conflicting.codigo_interno} - {conflicting.descricao}</strong>. Selecionar outro produto substituirá o vínculo.
                    </div>
                  </div>
                )}
                <ScrollArea className="flex-1 border rounded">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Cód. Interno</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>UN</TableHead>
                        <TableHead>NCM</TableHead>
                        <TableHead>Classificação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isFetching ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
                      ) : (results as any[]).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            <Package className="h-6 w-6 mx-auto mb-2 opacity-40" />
                            Nenhum produto encontrado. Ajuste a busca ou crie um novo produto.
                          </TableCell>
                        </TableRow>
                      ) : (results as any[]).map((p) => (
                        <TableRow
                          key={p.id}
                          className={`cursor-pointer ${selectedProductId === p.id ? "bg-primary/10" : "hover:bg-muted/50"}`}
                          onClick={() => setSelectedProductId(p.id)}
                        >
                          <TableCell>
                            <input type="radio" checked={selectedProductId === p.id} onChange={() => setSelectedProductId(p.id)} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{p.codigo_interno}</TableCell>
                          <TableCell className="font-medium">{p.descricao}</TableCell>
                          <TableCell>{p.unidade}</TableCell>
                          <TableCell className="font-mono text-xs">{p.ncm}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {[p.familias?.descricao, p.grupos?.descricao, p.subgrupos?.descricao].filter(Boolean).join(" / ") || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="new" className="flex-1 overflow-auto mt-3 mx-6">
                <div className="grid grid-cols-2 gap-3 pb-4">
                  <div>
                    <Label>Código Interno *</Label>
                    <Input value={newForm.codigo_interno} onChange={(e) => setNewForm({ ...newForm, codigo_interno: e.target.value })} />
                  </div>
                  <div>
                    <Label>Unidade *</Label>
                    <Input value={newForm.unidade} onChange={(e) => setNewForm({ ...newForm, unidade: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>Descrição *</Label>
                    <Input value={newForm.descricao} onChange={(e) => setNewForm({ ...newForm, descricao: e.target.value })} />
                  </div>
                  <div>
                    <Label>NCM * (8 dígitos)</Label>
                    <Input value={newForm.ncm} maxLength={8}
                      onChange={(e) => setNewForm({ ...newForm, ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
                  </div>
                  <div>
                    <Label>CEST</Label>
                    <Input value={newForm.cest ?? ""} onChange={(e) => setNewForm({ ...newForm, cest: e.target.value })} />
                  </div>
                  <div>
                    <Label>EAN / GTIN</Label>
                    <Input value={newForm.ean_gtin ?? ""} onChange={(e) => setNewForm({ ...newForm, ean_gtin: e.target.value })} />
                  </div>
                  <div>
                    <Label>Origem da Mercadoria *</Label>
                    <Select value={String(newForm.origem_mercadoria)} onValueChange={(v) => setNewForm({ ...newForm, origem_mercadoria: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORIGENS.map((o) => <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <ClassifSelect label="Família" value={newForm.familia_id ?? null} options={familias as any[]}
                    onChange={(v) => setNewForm({ ...newForm, familia_id: v })} />
                  <ClassifSelect label="Grupo" value={newForm.grupo_id ?? null} options={grupos as any[]}
                    onChange={(v) => setNewForm({ ...newForm, grupo_id: v })} />
                  <ClassifSelect label="Sub Grupo" value={newForm.subgrupo_id ?? null} options={subgrupos as any[]}
                    onChange={(v) => setNewForm({ ...newForm, subgrupo_id: v })} />
                </div>
                {!supplier && (
                  <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    O fornecedor emitente da nota ainda não está cadastrado. Cadastre-o antes de criar e vincular o produto.
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="p-4 border-t mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              {tab === "existing" ? (
                <Button
                  onClick={handleConfirmLink}
                  disabled={!selectedProductId || linkMut.isPending}
                >
                  {linkMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Confirmar Vínculo
                </Button>
              ) : (
                <Button
                  onClick={() => createMut.mutate()}
                  disabled={createMut.isPending || !supplier}
                >
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Criar e Vincular
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClassifSelect({ label, value, options, onChange }: {
  label: string; value: string | null; options: any[]; onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value ?? "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Nenhum —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.codigo} - {o.descricao}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
