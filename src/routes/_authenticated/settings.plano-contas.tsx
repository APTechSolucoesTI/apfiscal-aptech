import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getOrgSettings } from "@/lib/organization.functions";
import {
  listPlanoContas, savePlanoContas, togglePlanoContasAtivo, deletePlanoContas, proximoCodigoPlanoContas,
  type PlanoContasInput,
} from "@/lib/plano-contas.functions";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Loader2, BookOpen, ChevronRight, ChevronDown, FolderTree, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { ImportXlsxDialog, type ImportField } from "@/components/import/ImportXlsxDialog";

const pcImportFields: ImportField[] = [
  { key: "codigo", label: "Código", required: true, aliases: ["codigo", "cod", "conta", "codigoconta"] },
  { key: "descricao", label: "Descrição", required: true, aliases: ["descricao", "nome", "titulo"] },
  { key: "ativo", label: "Ativo", aliases: ["status", "ativo", "situacao"] },
  { key: "permite_lancamentos", label: "Permite Lançamentos", aliases: ["permitelancamentos", "analitica", "lancamento", "lancavel"] },
];

function parseBool(v: unknown, def = true): boolean {
  if (v == null || v === "") return def;
  if (typeof v === "boolean") return v;
  return ["1", "true", "sim", "ativo", "s", "y", "yes"].includes(String(v).trim().toLowerCase());
}

function normalizeCodigoPC(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const d = s.replace(/\D/g, "");
  if (d.length === 2) return d;
  if (d.length === 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length === 9) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  throw new Error("Código inválido. Use 99, 99.999 ou 99.999.9999");
}

function codigoPai(codigo: string): string | null {
  const parts = codigo.split(".");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

export const Route = createFileRoute("/_authenticated/settings/plano-contas")({
  component: PlanoContasPage,
  head: () => ({
    meta: [
      { title: "Plano de Contas | APFiscal" },
      { name: "description", content: "Cadastro hierárquico do Plano de Contas por empresa." },
      { property: "og:title", content: "Plano de Contas | APFiscal" },
      { property: "og:description", content: "Estruture o Plano de Contas em três níveis (99 > 99.999 > 99.999.9999)." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function maskCodigoPC(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").slice(0, 9);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
}

function codigoValido(c: string) {
  return /^\d{2}$/.test(c) || /^\d{2}\.\d{3}$/.test(c) || /^\d{2}\.\d{3}\.\d{4}$/.test(c);
}

function nivelDoCodigo(c: string): 1 | 2 | 3 {
  if (/^\d{2}\.\d{3}\.\d{4}$/.test(c)) return 3;
  if (/^\d{2}\.\d{3}$/.test(c)) return 2;
  return 1;
}

type Node = { row: any; children: Node[] };

function buildTree(rows: any[]): Node[] {
  const map = new Map<string, Node>();
  rows.forEach((r) => map.set(r.id, { row: r, children: [] }));
  const roots: Node[] = [];
  rows.forEach((r) => {
    const node = map.get(r.id)!;
    if (r.conta_pai_id && map.has(r.conta_pai_id)) map.get(r.conta_pai_id)!.children.push(node);
    else roots.push(node);
  });
  const sortRec = (arr: Node[]) => {
    arr.sort((a, b) => a.row.codigo.localeCompare(b.row.codigo));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

const GLOBAL = "__global__";

function PlanoContasPage() {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativos" | "inativos">("todos");
  const [tipoFilter, setTipoFilter] = useState<"todos" | "sintetica" | "analitica">("todos");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmInativar, setConfirmInativar] = useState<any | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState<any | null>(null);
  const [form, setForm] = useState<PlanoContasInput>({ company_id: null, codigo: "", descricao: "", ativo: true, permite_lancamentos: true, conta_pai_id: null });

  const getOrgFn = useServerFn(getOrgSettings);
  const { data: orgSettings } = useQuery({ queryKey: ["org-settings"], queryFn: () => getOrgFn() });
  const isGlobal = orgSettings?.catalog_scope === "global";

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, razao_social, nome_fantasia").order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Define a seleção inicial conforme o escopo do catálogo
  useEffect(() => {
    if (companyId) return;
    if (orgSettings === undefined) return;
    if (isGlobal) setCompanyId(GLOBAL);
    else if ((companies as any[])[0]) setCompanyId((companies as any[])[0].id);
  }, [orgSettings, isGlobal, companies, companyId]);

  const listFn = useServerFn(listPlanoContas);
  const saveFn = useServerFn(savePlanoContas);
  const toggleFn = useServerFn(togglePlanoContasAtivo);
  const delFn = useServerFn(deletePlanoContas);
  const nextCodeFn = useServerFn(proximoCodigoPlanoContas);

  const isGlobalView = companyId === GLOBAL;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["plano-contas", companyId],
    enabled: !!companyId,
    queryFn: () => listFn({ data: isGlobalView ? {} : { companyId } }),
  });

  const companyName = (id: string | null) => {
    if (!id) return "🌐 Global";
    const c = (companies as any[]).find((x) => x.id === id);
    return c ? (c.nome_fantasia ?? c.razao_social) : "—";
  };


  const filteredRows = useMemo(() => {
    return (rows as any[]).filter((r) => {
      if (statusFilter === "ativos" && !r.ativo) return false;
      if (statusFilter === "inativos" && r.ativo) return false;
      if (tipoFilter === "analitica" && !r.permite_lancamentos) return false;
      if (tipoFilter === "sintetica" && r.permite_lancamentos) return false;
      return true;
    });
  }, [rows, statusFilter, tipoFilter]);

  const matches = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return null;
    const set = new Set<string>();
    const byId = new Map((rows as any[]).map((r) => [r.id, r]));
    for (const r of rows as any[]) {
      if (r.codigo.toLowerCase().includes(s) || r.descricao.toLowerCase().includes(s)) {
        set.add(r.id);
        // expandir ancestrais
        let cur = r;
        while (cur.conta_pai_id) {
          set.add(cur.conta_pai_id);
          cur = byId.get(cur.conta_pai_id);
          if (!cur) break;
        }
      }
    }
    return set;
  }, [rows, search]);

  const tree = useMemo(() => buildTree(filteredRows), [filteredRows]);

  const isVisibleInSearch = (id: string) => !matches || matches.has(id);

  const toggleExp = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { ...form, company_id: form.company_id ?? null } }),
    onSuccess: () => {
      toast.success(form.id ? "Conta atualizada" : "Conta criada");
      qc.invalidateQueries({ queryKey: ["plano-contas"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plano-contas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Conta excluída");
      setConfirmExcluir(null);
      qc.invalidateQueries({ queryKey: ["plano-contas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openNew(pai: any | null = null) {
    const defaultCompany = pai ? (pai.company_id ?? null) : (isGlobalView ? null : (companyId || null));
    setForm({ company_id: defaultCompany, codigo: "", descricao: "", ativo: true, permite_lancamentos: true, conta_pai_id: pai?.id ?? null });
    setOpen(true);
    try {
      const { codigo } = await nextCodeFn({ data: { companyId: defaultCompany, contaPaiId: pai?.id ?? null } });
      setForm((f) => ({ ...f, codigo }));
    } catch { /* ignore */ }
  }
  function openEdit(r: any) {
    setForm({ id: r.id, company_id: r.company_id ?? null, codigo: r.codigo, descricao: r.descricao, ativo: r.ativo, permite_lancamentos: r.permite_lancamentos, conta_pai_id: r.conta_pai_id });
    setOpen(true);
  }

  const temSubcontas = (id: string) => (rows as any[]).some((r) => r.conta_pai_id === id);

  function renderNode(n: Node, depth: number): any {
    if (!isVisibleInSearch(n.row.id)) return null;
    const hasChildren = n.children.length > 0;
    const isOpen = !!matches || expanded.has(n.row.id);
    const analitica = n.row.permite_lancamentos;
    return (
      <div key={n.row.id}>
        <div className="flex items-center gap-2 px-3 py-2 border-b hover:bg-slate-50" style={{ paddingLeft: `${12 + depth * 20}px` }}>
          <button onClick={() => toggleExp(n.row.id)} className="w-5 h-5 flex items-center justify-center text-slate-400 shrink-0">
            {hasChildren ? (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
          </button>
          {analitica ? <FileText className="h-4 w-4 text-blue-500 shrink-0" /> : <FolderTree className="h-4 w-4 text-amber-600 shrink-0" />}
          <span className="font-mono text-sm w-36 shrink-0">{n.row.codigo}</span>
          <span className="flex-1 truncate">{n.row.descricao}</span>
          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 max-w-[180px] truncate">
            {companyName(n.row.company_id ?? null)}
          </Badge>
          <Badge variant="outline" className={analitica ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
            {analitica ? "Analítica" : "Sintética"}
          </Badge>
          <div className="flex items-center gap-2">
            <Switch
              checked={n.row.ativo}
              onCheckedChange={(v) => v ? toggleMut.mutate({ id: n.row.id, ativo: true }) : setConfirmInativar(n.row)}
            />
            <Badge variant="secondary" className={n.row.ativo ? "bg-green-100 text-green-800 border-green-200" : "bg-slate-100 text-slate-600 border-slate-200"}>
              {n.row.ativo ? "Ativa" : "Inativa"}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {nivelDoCodigo(n.row.codigo) < 3 && (
              <Button size="sm" variant="ghost" onClick={() => openNew(n.row)} title="Adicionar subconta">
                <Plus className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => openEdit(n.row)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => setConfirmExcluir(n.row)}>
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </div>
        {isOpen && hasChildren && <div>{n.children.map((c) => renderNode(c, depth + 1))}</div>}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" /> Plano de Contas
        </h1>
        <p className="text-sm text-slate-500">Estrutura hierárquica em três níveis (99 &gt; 99.999 &gt; 99.999.9999).</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex gap-2 items-center flex-wrap">
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                <SelectContent>
                  {isGlobal && <SelectItem value={GLOBAL}>🌐 Global — Todas as empresas</SelectItem>}
                  {(companies as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_fantasia ?? c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativos">Ativas</SelectItem>
                  <SelectItem value="inativos">Inativas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tipoFilter} onValueChange={(v: any) => setTipoFilter(v)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="sintetica">Sintéticas</SelectItem>
                  <SelectItem value="analitica">Analíticas</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-72">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código ou descrição" className="pl-9" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!isGlobal && (companies as any[]).length === 0}>
                <Upload className="h-4 w-4 mr-1" /> Importar XLSX
              </Button>
              <Button onClick={() => openNew(null)} disabled={!companyId}><Plus className="h-4 w-4 mr-1" /> Nova Conta</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : tree.length === 0 ? (
            <div className="text-center py-12 text-slate-500">Nenhuma conta cadastrada.</div>
          ) : (
            <div className="border-t">{tree.map((n) => renderNode(n, 0))}</div>
          )}
        </CardContent>
      </Card>

      <ImportXlsxDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Plano de Contas via Excel"
        description={isGlobal
          ? "As contas podem ser globais (todas as empresas) ou de uma empresa específica. Ordene do nível 1 para o nível 3 — as contas pai são vinculadas automaticamente pelo código."
          : "Selecione a empresa e envie a planilha. Ordene as contas do nível 1 para o nível 3 — as contas pai são vinculadas automaticamente pelo código."}
        fields={pcImportFields}
        companies={(companies as any[]).map((c) => ({ id: c.id, label: c.nome_fantasia ?? c.razao_social }))}
        allowGlobal={isGlobal}
        requireCompanySelection={!isGlobal}
        buildRow={(m, ctx) => {
          if (!isGlobal && !ctx.companyId) throw new Error("Selecione uma empresa antes de importar");
          const codigo = normalizeCodigoPC(m.codigo);
          const descricao = String(m.descricao ?? "").trim();
          if (!descricao) throw new Error("Descrição obrigatória");
          return {
            company_id: ctx.companyId ?? null,
            codigo,
            descricao,
            ativo: parseBool(m.ativo, true),
            permite_lancamentos: parseBool(m.permite_lancamentos, true),
            conta_pai_id: null,
          } as PlanoContasInput;
        }}
        checkDuplicate={async (row) => {
          let q = supabase
            .from("plano_contas")
            .select("id", { count: "exact", head: true })
            .eq("codigo", row.codigo);
          q = row.company_id ? q.eq("company_id", row.company_id) : q.is("company_id", null);
          const { count, error } = await q;
          if (error) return false;
          return (count ?? 0) > 0;
        }}
        onImportRow={async (row) => {
          const pai = codigoPai(row.codigo);
          let conta_pai_id: string | null = null;
          if (pai) {
            let pq = supabase
              .from("plano_contas")
              .select("id")
              .eq("codigo", pai);
            pq = row.company_id ? pq.eq("company_id", row.company_id) : pq.is("company_id", null);
            const { data } = await pq.maybeSingle();
            if (!data) throw new Error(`Conta pai ${pai} não encontrada. Importe/ordene as contas do nível 1 para o nível 3.`);
            conta_pai_id = (data as any).id;
          }
          await saveFn({ data: { ...row, conta_pai_id } });
        }}
        onDone={() => qc.invalidateQueries({ queryKey: ["plano-contas"] })}
      />



      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar" : "Nova"} Conta</DialogTitle>
            <DialogDescription>
              {form.conta_pai_id ? "Subconta — o prefixo do código herda da conta pai." : "Conta raiz — nível 1 (99)."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Empresa {isGlobal ? "" : "*"}</Label>
              <Select
                value={form.company_id ?? GLOBAL}
                onValueChange={(v) => setForm({ ...form, company_id: v === GLOBAL ? null : v })}
                disabled={!!form.conta_pai_id}
              >
                <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                <SelectContent>
                  {isGlobal && <SelectItem value={GLOBAL}>🌐 Global — Todas as empresas</SelectItem>}
                  {(companies as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_fantasia ?? c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.conta_pai_id && <p className="text-xs text-slate-500 mt-1">Subcontas herdam o vínculo da conta pai.</p>}
            </div>
            <div>
              <Label>Código *</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: maskCodigoPC(e.target.value) })}
                placeholder={form.conta_pai_id ? "" : "01"}
                className="font-mono"
                maxLength={11}
              />
              {form.codigo && !codigoValido(form.codigo) && (
                <p className="text-xs text-red-600 mt-1">Formato inválido. Use 99, 99.999 ou 99.999.9999</p>
              )}
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-2 border rounded-md p-3">
              <div>
                <Label>Permite Lançamentos</Label>
                <p className="text-xs text-slate-500">Contas com subcontas são automaticamente sintéticas (não permitem lançamentos).</p>
              </div>
              <Switch
                checked={form.permite_lancamentos ?? true}
                disabled={!!form.id && temSubcontas(form.id)}
                onCheckedChange={(v) => setForm({ ...form, permite_lancamentos: v })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !codigoValido(form.codigo) || !form.descricao.trim()}
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmInativar} onOpenChange={(o) => !o && setConfirmInativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao inativar, esta conta deixará de aparecer como opção em novos lançamentos. Lançamentos já existentes NÃO serão alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { toggleMut.mutate({ id: confirmInativar.id, ativo: false }); setConfirmInativar(null); }}>Inativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmExcluir} onOpenChange={(o) => !o && setConfirmExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão é bloqueada quando há subcontas ou lançamentos vinculados. Nesse caso, inative a conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => delMut.mutate(confirmExcluir.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
