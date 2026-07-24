import { useMemo, useState, useEffect, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listProducts, saveProduct, deleteProduct, deleteProducts,
  listProductSuppliers, saveProductSupplier, deleteProductSupplier,
  getNextProductCode,
  type ProdutoInput,
} from "@/lib/products.functions";
import { listClassifications } from "@/lib/classifications.functions";
import { getOrgSettings } from "@/lib/organization.functions";
import { listSuppliers } from "@/lib/suppliers.functions";
import { Checkbox } from "@/components/ui/checkbox";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Search, Building2, Loader2, Package, Upload } from "lucide-react";
import { toast } from "sonner";
import { ImportXlsxDialog, type ImportField } from "@/components/import/ImportXlsxDialog";
import { useColumnPreferences, type ColumnDef } from "@/hooks/use-column-preferences";
import { ColumnSettings } from "@/components/common/ColumnSettings";
import { TablePagination } from "@/components/common/TablePagination";


export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
  head: () => ({
    meta: [
      { title: "Produtos | APFiscal" },
      { name: "description", content: "Cadastro de produtos com classificação (família, grupo, subgrupo) e vínculo N:N com fornecedores." },
      { property: "og:title", content: "Produtos | APFiscal" },
      { property: "og:description", content: "Gerencie o catálogo de produtos por empresa ou global e vincule códigos dos fornecedores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ORIGENS: Array<{ v: number; label: string }> = [
  { v: 0, label: "0 - Nacional" },
  { v: 1, label: "1 - Estrangeira (importação direta)" },
  { v: 2, label: "2 - Estrangeira (mercado interno)" },
  { v: 3, label: "3 - Nacional (mais de 40% conteúdo importado)" },
  { v: 4, label: "4 - Nacional (produção conforme processos básicos)" },
  { v: 5, label: "5 - Nacional (até 40% conteúdo importado)" },
  { v: 6, label: "6 - Estrangeira (importação direta, sem similar nacional)" },
  { v: 7, label: "7 - Estrangeira (mercado interno, sem similar nacional)" },
  { v: 8, label: "8 - Nacional (mais de 70% conteúdo importado)" },
];

const empty: ProdutoInput = {
  company_id: null,
  codigo_interno: "",
  descricao: "",
  unidade: "UN",
  ncm: "",
  origem_mercadoria: 0,
  ativo: true,
};

const productImportFields: ImportField[] = [
  { key: "codigo_interno", label: "Código Interno", required: true, aliases: ["codigo", "codigointerno", "sku", "cod"] },
  { key: "descricao", label: "Descrição", required: true, aliases: ["descricao", "nome", "produto"] },
  { key: "unidade", label: "Unidade", required: true, aliases: ["un", "unid", "unidade"] },
  { key: "ncm", label: "NCM", required: true, aliases: ["ncm"] },
  { key: "ean_gtin", label: "EAN/GTIN", aliases: ["ean", "gtin", "codigobarras"] },
  { key: "cest", label: "CEST", aliases: ["cest"] },
  { key: "origem_mercadoria", label: "Origem Mercadoria", aliases: ["origem", "origemmercadoria"] },
  { key: "familia_codigo", label: "Código Família", aliases: ["familia", "codfamilia", "familiacodigo"] },
  { key: "grupo_codigo", label: "Código Grupo", aliases: ["grupo", "codgrupo", "grupocodigo"] },
  { key: "subgrupo_codigo", label: "Código Subgrupo", aliases: ["subgrupo", "codsubgrupo", "subgrupocodigo"] },
  { key: "ativo", label: "Ativo", aliases: ["status", "ativo"] },
];


function ProductsPage() {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<ProdutoInput>(empty);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());


  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies")
        .select("id, razao_social, nome_fantasia, cnpj").order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const orgSettingsFn = useServerFn(getOrgSettings);
  const { data: orgSettings } = useQuery({ queryKey: ["org-settings"], queryFn: () => orgSettingsFn() });
  const isGlobal = orgSettings?.catalog_scope === "global";

  const list = useServerFn(listProducts);
  const save = useServerFn(saveProduct);
  const remove = useServerFn(deleteProduct);
  const removeMany = useServerFn(deleteProducts);
  const listClass = useServerFn(listClassifications);
  const nextCodeFn = useServerFn(getNextProductCode);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["produtos", companyId],
    queryFn: () => list({ data: { companyId: companyId === "all" ? undefined : companyId } }),
  });

  const classScope = form.company_id ?? undefined;
  const { data: familias = [] } = useQuery({
    queryKey: ["classif", "familias", classScope],
    queryFn: () => listClass({ data: { tabela: "familias", companyId: classScope } }),
    enabled: open,
  });
  const { data: grupos = [] } = useQuery({
    queryKey: ["classif", "grupos", classScope],
    queryFn: () => listClass({ data: { tabela: "grupos", companyId: classScope } }),
    enabled: open,
  });
  const { data: subgrupos = [] } = useQuery({
    queryKey: ["classif", "subgrupos", classScope],
    queryFn: () => listClass({ data: { tabela: "subgrupos", companyId: classScope } }),
    enabled: open,
  });

  const saveMut = useMutation({
    mutationFn: (payload: ProdutoInput) => save({ data: payload }),
    onSuccess: (r) => {
      toast.success("Produto salvo");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      setForm((f) => ({ ...f, id: r.id }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Produto excluído");
      qc.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDelMut = useMutation({
    mutationFn: (ids: string[]) => removeMany({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`${r.count} produto(s) excluído(s)`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (products as any[]).filter((p) =>
      !s ||
      p.descricao?.toLowerCase().includes(s) ||
      p.codigo_interno?.toLowerCase().includes(s) ||
      p.ncm?.includes(s) ||
      p.ean_gtin?.includes(s),
    );
  }, [products, search]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((p: any) => p.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (visible.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const allChecked = filtered.length > 0 && filtered.every((p: any) => selectedIds.has(p.id));
  const someChecked = selectedIds.size > 0 && !allChecked;

  type Col = ColumnDef & { className?: string; headClassName?: string; render: (r: any) => ReactNode };
  const columns: Col[] = useMemo(() => [
    { key: "codigo_interno", label: "Código Interno", className: "font-mono text-xs", render: (p) => p.codigo_interno },
    { key: "descricao", label: "Descrição", className: "font-medium", render: (p) => p.descricao },
    { key: "unidade", label: "Unid.", render: (p) => p.unidade },
    { key: "ncm", label: "NCM", className: "font-mono text-xs", render: (p) => p.ncm },
    { key: "cest", label: "CEST", className: "font-mono text-xs", render: (p) => p.cest ?? "—" },
    { key: "ean", label: "EAN", className: "font-mono text-xs", render: (p) => p.ean ?? "—" },
    { key: "origem", label: "Origem", className: "text-xs", render: (p) => (p.origem ?? p.origem === 0) ? String(p.origem) : "—" },
    { key: "familia", label: "Família", className: "text-xs", render: (p) => p.familias ? `${p.familias.codigo} - ${p.familias.descricao}` : "—" },
    { key: "grupo", label: "Grupo", className: "text-xs", render: (p) => p.grupos ? `${p.grupos.codigo} - ${p.grupos.descricao}` : "—" },
    { key: "subgrupo", label: "Subgrupo", className: "text-xs", render: (p) => p.subgrupos ? `${p.subgrupos.codigo} - ${p.subgrupos.descricao}` : "—" },
    { key: "empresa", label: "Empresa", className: "text-xs", render: (p) => p.company_id ? (p.companies?.razao_social ?? "—") : <Badge variant="secondary">Global</Badge> },
    { key: "status", label: "Status", render: (p) => (<Badge variant={p.ativo ? "default" : "outline"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>) },
    { key: "actions", label: "Ações", alwaysVisible: true, headClassName: "w-24 text-right", className: "text-right", render: (p) => (
      <>
        <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir produto?")) delMut.mutate(p.id); }}>
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
      </>
    ) },
  ], []);
  const { visibleColumns, allColumns, isVisible, toggleVisible, moveColumn, reset, pageSize, setPageSize } = useColumnPreferences("products", columns);
  const visibleCols = useMemo(() => visibleColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean), [visibleColumns, columns]);
  const orderedCols = useMemo(() => allColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean), [allColumns, columns]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, companyId, pageSize, filtered.length]);
  const pagedFiltered = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  function openNew() {
    const defaultCompany = isGlobal ? null : (companyId !== "all" ? companyId : ((companies as any[])[0]?.id ?? null));
    setForm({ ...empty, company_id: defaultCompany });
    setOpen(true);
  }
  function openEdit(p: any) {
    setForm({
      id: p.id,
      company_id: p.company_id,
      codigo_interno: p.codigo_interno,
      descricao: p.descricao,
      unidade: p.unidade,
      ean_gtin: p.ean_gtin,
      ncm: p.ncm,
      cest: p.cest,
      origem_mercadoria: p.origem_mercadoria,
      familia_id: p.familia_id,
      grupo_id: p.grupo_id,
      subgrupo_id: p.subgrupo_id,
      ativo: p.ativo,
    });
    setOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="text-sm text-slate-500">Catálogo com classificação hierárquica e vínculo N:N com fornecedores.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!isGlobal && (companies as any[]).length === 0}>
            <Upload className="h-4 w-4 mr-1" /> Importar XLSX
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Produto</Button>
        </div>
      </div>

      <ImportXlsxDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Produtos via Excel"
        description={isGlobal
          ? "Selecione se os produtos serão compartilhados por todas as empresas (Global) ou vinculados a uma empresa específica."
          : "Selecione a empresa em que os produtos serão cadastrados."}
        fields={productImportFields}
        companies={(companies as any[]).map((c) => ({ id: c.id, label: `${c.razao_social}${c.nome_fantasia ? ` (${c.nome_fantasia})` : ""}` }))}
        allowGlobal={isGlobal}
        requireCompanySelection={!isGlobal}
        buildRow={(m, ctx) => {
          const cid = ctx.companyId;
          if (!isGlobal && !cid) throw new Error("Selecione uma empresa antes de importar");
          const codigo = String(m.codigo_interno ?? "").trim();
          if (!codigo) throw new Error("Código interno obrigatório");
          const descricao = String(m.descricao ?? "").trim();
          if (!descricao) throw new Error("Descrição obrigatória");
          const unidade = String(m.unidade ?? "UN").trim() || "UN";
          const ncm = String(m.ncm ?? "").replace(/\D/g, "").slice(0, 8);
          if (!/^\d{8}$/.test(ncm)) throw new Error("NCM deve ter 8 dígitos");
          const origemRaw = m.origem_mercadoria != null ? Number(String(m.origem_mercadoria).replace(/\D/g, "")) : 0;
          const origem = Number.isFinite(origemRaw) && origemRaw >= 0 && origemRaw <= 8 ? origemRaw : 0;
          const ativoRaw = m.ativo == null ? true : String(m.ativo).toLowerCase();
          const ativo = ativoRaw === true || ["1", "true", "sim", "ativo", "s", "y", "yes"].includes(String(ativoRaw));
          return {
            company_id: cid,
            codigo_interno: codigo,
            descricao,
            unidade,
            ean_gtin: m.ean_gtin ? String(m.ean_gtin) : null,
            ncm,
            cest: m.cest ? String(m.cest) : null,
            origem_mercadoria: origem,
            ativo,
            _familia_codigo: m.familia_codigo ? String(m.familia_codigo).trim() : null,
            _grupo_codigo: m.grupo_codigo ? String(m.grupo_codigo).trim() : null,
            _subgrupo_codigo: m.subgrupo_codigo ? String(m.subgrupo_codigo).trim() : null,
          } as ProdutoInput & { _familia_codigo: string | null; _grupo_codigo: string | null; _subgrupo_codigo: string | null };
        }}
        checkDuplicate={async (row) => {
          const q = supabase.from("produtos").select("id", { count: "exact", head: true }).eq("codigo_interno", row.codigo_interno);
          const scoped = row.company_id ? q.eq("company_id", row.company_id) : q.is("company_id", null);
          const { count, error } = await scoped;
          if (error) return false;
          return (count ?? 0) > 0;
        }}
        onImportRow={async (row: any) => {
          const scope = row.company_id ?? undefined;
          async function resolveClass(tabela: "familias" | "grupos" | "subgrupos", codigo: string | null) {
            if (!codigo) return null;
            const rows = await listClass({ data: { tabela, companyId: scope } });
            const match = (rows as any[]).find((r) => String(r.codigo).trim() === codigo);
            return match?.id ?? null;
          }
          const [familia_id, grupo_id, subgrupo_id] = await Promise.all([
            resolveClass("familias", row._familia_codigo),
            resolveClass("grupos", row._grupo_codigo),
            resolveClass("subgrupos", row._subgrupo_codigo),
          ]);
          const { _familia_codigo, _grupo_codigo, _subgrupo_codigo, ...clean } = row;
          await save({ data: { ...clean, familia_id, grupo_id, subgrupo_id } as ProdutoInput });
        }}
        onDone={() => qc.invalidateQueries({ queryKey: ["produtos"] })}
      />


      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex gap-2 items-center">
              <Building2 className="h-4 w-4 text-slate-500" />
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {(companies as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.razao_social}{c.nome_fantasia ? ` (${c.nome_fantasia})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, descrição, NCM, EAN" className="pl-9" />
              </div>
              <ColumnSettings columns={orderedCols} isVisible={isVisible} toggleVisible={toggleVisible} moveColumn={moveColumn} reset={reset} pageSize={pageSize} onPageSizeChange={setPageSize} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between px-3 py-2 mb-3 rounded border bg-amber-50">
              <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
              <Button size="sm" variant="destructive"
                onClick={() => { if (confirm(`Excluir ${selectedIds.size} produto(s)?`)) bulkDelMut.mutate(Array.from(selectedIds)); }}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir selecionados
              </Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={() => { if (allChecked) setSelectedIds(new Set()); else setSelectedIds(new Set(filtered.map((p: any) => p.id))); }}
                  />
                </TableHead>
                {visibleCols.map((c) => (
                  <TableHead key={c.key} className={c.headClassName}>{c.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={visibleCols.length + 1} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={visibleCols.length + 1} className="text-center py-8 text-slate-500">
                  <Package className="h-6 w-6 mx-auto mb-2 opacity-40" />Nenhum produto cadastrado.
                </TableCell></TableRow>
              ) : pagedFiltered.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={() => setSelectedIds((prev) => {
                        const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next;
                      })}
                    />
                  </TableCell>
                  {visibleCols.map((c) => (
                    <TableCell key={c.key} className={c.className}>{c.render(p)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar" : "Novo"} Produto</DialogTitle>
            <DialogDescription>
              Preencha os dados do produto, sua classificação e os fornecedores que o fornecem.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados do Produto</TabsTrigger>
              <TabsTrigger value="classif">Classificação</TabsTrigger>
              <TabsTrigger value="forn" disabled={!form.id}>Fornecedores {form.id ? "" : "(salvar primeiro)"}</TabsTrigger>
            </TabsList>
            <TabsContent value="dados" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Empresa {isGlobal ? "" : "*"}</Label>
                  <Select
                    value={form.company_id ?? "__global__"}
                    onValueChange={(v) => setForm({ ...form, company_id: v === "__global__" ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {isGlobal && <SelectItem value="__global__">🌐 Global — Todas as empresas</SelectItem>}
                      {(companies as any[]).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Código Interno *</Label>
                  <Input value={form.codigo_interno} onChange={(e) => setForm({ ...form, codigo_interno: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Descrição *</Label>
                  <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </div>
                <div>
                  <Label>Unidade *</Label>
                  <Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="UN, KG, CX, LT..." />
                </div>
                <div>
                  <Label>EAN / GTIN</Label>
                  <Input value={form.ean_gtin ?? ""} onChange={(e) => setForm({ ...form, ean_gtin: e.target.value })} />
                </div>
                <div>
                  <Label>NCM * (8 dígitos)</Label>
                  <Input value={form.ncm} maxLength={8}
                    onChange={(e) => setForm({ ...form, ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
                </div>
                <div>
                  <Label>CEST</Label>
                  <Input value={form.cest ?? ""} onChange={(e) => setForm({ ...form, cest: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Origem da Mercadoria *</Label>
                  <Select value={String(form.origem_mercadoria)} onValueChange={(v) => setForm({ ...form, origem_mercadoria: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORIGENS.map((o) => <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="classif" className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <ClassifSelect label="Família" value={form.familia_id ?? null} options={familias as any[]}
                  onChange={(v) => setForm({ ...form, familia_id: v })} />
                <ClassifSelect label="Grupo" value={form.grupo_id ?? null} options={grupos as any[]}
                  onChange={(v) => setForm({ ...form, grupo_id: v })} />
                <ClassifSelect label="Sub Grupo" value={form.subgrupo_id ?? null} options={subgrupos as any[]}
                  onChange={(v) => setForm({ ...form, subgrupo_id: v })} />
              </div>
              <p className="text-xs text-slate-500">
                Cadastre as opções em <a className="underline" href="/classifications">Classificações</a>.
              </p>
            </TabsContent>

            <TabsContent value="forn" className="space-y-4">
              {form.id ? <FornecedoresBlock produtoId={form.id} empresaId={form.company_id ?? null} /> : null}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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

function FornecedoresBlock({ produtoId, empresaId }: { produtoId: string; empresaId: string | null }) {
  const qc = useQueryClient();
  const listPs = useServerFn(listProductSuppliers);
  const savePs = useServerFn(saveProductSupplier);
  const delPs = useServerFn(deleteProductSupplier);
  const suppliersFn = useServerFn(listSuppliers);

  const { data: vinculos = [], isLoading } = useQuery({
    queryKey: ["produtos_fornecedores", produtoId],
    queryFn: () => listPs({ data: { produtoId } }),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: () => suppliersFn({ data: {} }),
  });

  const [newForn, setNewForn] = useState<string>("");
  const [newCodigo, setNewCodigo] = useState<string>("");

  const saveMut = useMutation({
    mutationFn: () => savePs({ data: { produto_id: produtoId, fornecedor_id: newForn, codigo_item_nota: newCodigo, empresa_id: empresaId } }),
    onSuccess: () => {
      toast.success("Vínculo adicionado");
      setNewForn(""); setNewCodigo("");
      qc.invalidateQueries({ queryKey: ["produtos_fornecedores", produtoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => delPs({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["produtos_fornecedores", produtoId] }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px_auto] gap-2 sm:items-end">
        <div className="min-w-0">
          <Label>Fornecedor</Label>
          <Select value={newForn} onValueChange={setNewForn}>
            <SelectTrigger className="w-full min-w-0">
              <SelectValue placeholder="Selecione" className="truncate" />
            </SelectTrigger>
            <SelectContent className="max-w-[90vw]">
              {(suppliers as any[]).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="truncate block max-w-[70vw] sm:max-w-[520px]">
                    {s.razao_social} — {s.cnpj_cpf}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <Label>Código do Item na Nota</Label>
          <Input value={newCodigo} onChange={(e) => setNewCodigo(e.target.value)} />
        </div>
        <Button className="w-full sm:w-auto" onClick={() => saveMut.mutate()} disabled={!newForn || !newCodigo || saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead>CNPJ / CPF</TableHead>
              <TableHead>Cód. Item Nota</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : (vinculos as any[]).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-4 text-slate-500">Nenhum fornecedor vinculado.</TableCell></TableRow>
            ) : (vinculos as any[]).map((v) => (
              <TableRow key={v.id}>
                <TableCell className="max-w-[320px] truncate" title={v.suppliers?.razao_social ?? ""}>
                  {v.suppliers?.razao_social ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">{v.suppliers?.cnpj_cpf ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{v.codigo_item_nota}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover vínculo?")) removeMut.mutate(v.id); }}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
