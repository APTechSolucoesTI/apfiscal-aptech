import { useMemo, useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listProducts, saveProduct, deleteProduct, deleteProducts, type ProductInput } from "@/lib/products.functions";
import { getOrgSettings } from "@/lib/organization.functions";
import { listSuppliers } from "@/lib/suppliers.functions";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Card, CardContent, CardHeader,
} from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
  head: () => ({
    meta: [
      { title: "Produtos | APFiscal" },
      { name: "description", content: "Cadastro e listagem de produtos por empresa com vínculo a ERPs." },
      { property: "og:title", content: "Produtos | APFiscal" },
      { property: "og:description", content: "Gerencie o catálogo de produtos por empresa e integre com o seu ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const empty: ProductInput = {
  company_id: null,
  codigo: "",
  descricao: "",
  ativo: true,
};

const productImportFields: ImportField[] = [
  { key: "codigo", label: "Código", required: true, aliases: ["cod", "codigo", "sku", "codigointerno"] },
  { key: "descricao", label: "Descrição", required: true, aliases: ["descricao", "produto", "nome"] },
  { key: "codigo_fornecedor", label: "Código Fornecedor", aliases: ["codfornecedor", "codigofornecedor"] },
  { key: "ncm", label: "NCM" },
  { key: "cest", label: "CEST" },
  { key: "cfop_padrao", label: "CFOP", aliases: ["cfop", "cfoppadrao"] },
  { key: "unidade", label: "Unidade", aliases: ["un", "unid", "unidade"] },
  { key: "ean", label: "EAN/GTIN", aliases: ["ean", "gtin", "codigobarras"] },
  { key: "valor_unitario", label: "Valor Unitário", aliases: ["valor", "preco", "precounit", "valorunit"], transform: (v) => Number(String(v).replace(",", ".")) },
  { key: "aliquota_icms", label: "Alíquota ICMS (%)", aliases: ["icms", "aliqicms"], transform: (v) => Number(String(v).replace(",", ".")) },
  { key: "aliquota_ipi", label: "Alíquota IPI (%)", aliases: ["ipi", "aliqipi"], transform: (v) => Number(String(v).replace(",", ".")) },
  { key: "origem_mercadoria", label: "Origem Mercadoria", aliases: ["origem"] },
  { key: "erp_system", label: "Sistema ERP", aliases: ["erp"] },
  { key: "erp_code", label: "Código no ERP", aliases: ["codigoerp", "erpcode"] },
];

function ProductsPage() {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<ProductInput>(empty);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, razao_social, cnpj").order("razao_social");
      if (error) throw error;
      return data;
    },
  });

  const orgSettingsFn = useServerFn(getOrgSettings);
  const { data: orgSettings } = useQuery({ queryKey: ["org-settings"], queryFn: () => orgSettingsFn() });
  const isGlobal = orgSettings?.catalog_scope === "global";

  const list = useServerFn(listProducts);
  const save = useServerFn(saveProduct);
  const remove = useServerFn(deleteProduct);
  const removeMany = useServerFn(deleteProducts);
  const suppliersFn = useServerFn(listSuppliers);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", companyId],
    queryFn: () => list({ data: { companyId: companyId === "all" ? undefined : companyId } }),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-product", form.company_id],
    queryFn: () => suppliersFn({ data: { companyId: form.company_id || undefined } }),
    enabled: !!form.company_id,
  });

  const saveMut = useMutation({
    mutationFn: (payload: ProductInput) => save({ data: payload }),
    onSuccess: () => {
      toast.success("Produto salvo com sucesso");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Produto excluído");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDelMut = useMutation({
    mutationFn: (ids: string[]) => removeMany({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`${r.count} produto(s) excluído(s)`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return products.filter((p: any) =>
      !s ||
      p.descricao?.toLowerCase().includes(s) ||
      p.codigo?.toLowerCase().includes(s) ||
      p.ncm?.includes(s) ||
      p.ean?.includes(s),
    );
  }, [products, search]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(filtered.map((p: any) => p.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (visible.has(id)) next.add(id); });
      return next;
    });
  }, [filtered]);

  const allChecked = filtered.length > 0 && filtered.every((p: any) => selectedIds.has(p.id));
  const someChecked = selectedIds.size > 0 && !allChecked;
  function toggleAll() {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((p: any) => p.id)));
  }
  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir ${selectedIds.size} produto(s) selecionado(s)?`)) return;
    bulkDelMut.mutate(Array.from(selectedIds));
  }


  function openNew() {
    const defaultCompany = isGlobal ? null : (companyId !== "all" ? companyId : (companies[0]?.id ?? null));
    setForm({ ...empty, company_id: defaultCompany });
    setOpen(true);
  }

  function openEdit(p: any) {
    setForm({
      id: p.id,
      company_id: p.company_id,
      codigo: p.codigo,
      codigo_fornecedor: p.codigo_fornecedor,
      descricao: p.descricao,
      ncm: p.ncm,
      cest: p.cest,
      cfop_padrao: p.cfop_padrao,
      unidade: p.unidade,
      ean: p.ean,
      origem_mercadoria: p.origem_mercadoria,
      valor_unitario: p.valor_unitario,
      aliquota_icms: p.aliquota_icms,
      aliquota_ipi: p.aliquota_ipi,
      supplier_id: p.supplier_id,
      ativo: p.ativo,
      erp_system: p.erp_system,
      erp_code: p.erp_code,
      erp_external_id: p.erp_external_id,
    });
    setOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="text-sm text-slate-500">Catálogo de produtos por empresa com vínculo a ERPs.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={companies.length === 0}>
            <Upload className="h-4 w-4 mr-1" /> Importar XLSX
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Produto</Button>
        </div>

        <ImportXlsxDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          title="Importar Produtos via Excel"
          description={`Registros serão vinculados à empresa: ${companies.find((c: any) => c.id === (companyId !== "all" ? companyId : companies[0]?.id))?.razao_social ?? "—"}`}
          fields={productImportFields}
          buildRow={(m) => {
            const cid = companyId !== "all" ? companyId : companies[0]?.id;
            if (!cid) throw new Error("Selecione uma empresa antes de importar");
            if (!m.codigo) throw new Error("Código obrigatório");
            if (!m.descricao) throw new Error("Descrição obrigatória");
            const num = (v: unknown) => v == null || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
            return {
              company_id: cid,
              codigo: String(m.codigo),
              descricao: String(m.descricao),
              codigo_fornecedor: m.codigo_fornecedor ? String(m.codigo_fornecedor) : null,
              ncm: m.ncm ? String(m.ncm) : null,
              cest: m.cest ? String(m.cest) : null,
              cfop_padrao: m.cfop_padrao ? String(m.cfop_padrao) : null,
              unidade: m.unidade ? String(m.unidade) : null,
              ean: m.ean ? String(m.ean) : null,
              valor_unitario: num(m.valor_unitario),
              aliquota_icms: num(m.aliquota_icms),
              aliquota_ipi: num(m.aliquota_ipi),
              origem_mercadoria: m.origem_mercadoria ? String(m.origem_mercadoria) : null,
              erp_system: m.erp_system ? String(m.erp_system) : null,
              erp_code: m.erp_code ? String(m.erp_code) : null,
              ativo: true,
            } as ProductInput;
          }}
          onImportRow={async (row) => { await save({ data: row }); }}
          onDone={() => qc.invalidateQueries({ queryKey: ["products"] })}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex gap-2 items-center">
              <Building2 className="h-4 w-4 text-slate-500" />
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {companies.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, descrição, NCM, EAN" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between px-3 py-2 mb-3 rounded border bg-amber-50 dark:bg-amber-950/30">
              <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDelMut.isPending}>
                  {bulkDelMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Excluir selecionados
                </Button>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>NCM</TableHead>
                <TableHead>Unid.</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>ERP</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500"><Package className="h-6 w-6 mx-auto mb-2 opacity-40" />Nenhum produto cadastrado.</TableCell></TableRow>
              ) : filtered.map((p: any) => (
                <TableRow key={p.id} data-state={selectedIds.has(p.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={() => toggleRow(p.id)}
                      aria-label={`Selecionar ${p.descricao}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                  <TableCell><div className="font-medium">{p.descricao}</div></TableCell>
                  <TableCell className="font-mono text-xs">{p.ncm ?? "—"}</TableCell>
                  <TableCell>{p.unidade ?? "—"}</TableCell>
                  <TableCell className="text-xs">{p.suppliers?.razao_social ?? "—"}</TableCell>
                  <TableCell>
                    {p.erp_system ? (
                      <div className="text-xs">
                        <div className="font-medium">{p.erp_system}</div>
                        <div className="text-slate-500 font-mono">{p.erp_code ?? p.erp_external_id ?? "—"}</div>
                      </div>
                    ) : <Badge variant="outline">Não vinculado</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.origem === "auto_nfe" ? "secondary" : "outline"}>
                      {p.origem === "auto_nfe" ? "Auto (NF-e)" : p.origem === "erp" ? "ERP" : "Manual"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir produto?")) delMut.mutate(p.id); }}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>

      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar" : "Novo"} Produto</DialogTitle>
            <DialogDescription>Cadastre o produto no catálogo da empresa e opcionalmente vincule ao ERP.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
              <TabsTrigger value="erp">Integração ERP</TabsTrigger>
            </TabsList>
            <TabsContent value="dados" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Empresa *</Label>
                  <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fornecedor</Label>
                  <Select value={form.supplier_id ?? "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.razao_social}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Código interno *</Label>
                  <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                </div>
                <div>
                  <Label>Código do fornecedor</Label>
                  <Input value={form.codigo_fornecedor ?? ""} onChange={(e) => setForm({ ...form, codigo_fornecedor: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Descrição *</Label>
                  <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Input value={form.unidade ?? ""} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="UN, PC, KG..." />
                </div>
                <div>
                  <Label>EAN / GTIN</Label>
                  <Input value={form.ean ?? ""} onChange={(e) => setForm({ ...form, ean: e.target.value })} />
                </div>
                <div>
                  <Label>Valor unitário</Label>
                  <Input type="number" step="0.0001" value={form.valor_unitario ?? ""} onChange={(e) => setForm({ ...form, valor_unitario: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="fiscal" className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div><Label>NCM</Label><Input value={form.ncm ?? ""} onChange={(e) => setForm({ ...form, ncm: e.target.value })} /></div>
                <div><Label>CEST</Label><Input value={form.cest ?? ""} onChange={(e) => setForm({ ...form, cest: e.target.value })} /></div>
                <div><Label>CFOP padrão</Label><Input value={form.cfop_padrao ?? ""} onChange={(e) => setForm({ ...form, cfop_padrao: e.target.value })} /></div>
                <div><Label>Origem mercadoria</Label><Input value={form.origem_mercadoria ?? ""} onChange={(e) => setForm({ ...form, origem_mercadoria: e.target.value })} /></div>
                <div><Label>Alíquota ICMS (%)</Label><Input type="number" step="0.01" value={form.aliquota_icms ?? ""} onChange={(e) => setForm({ ...form, aliquota_icms: e.target.value ? Number(e.target.value) : null })} /></div>
                <div><Label>Alíquota IPI (%)</Label><Input type="number" step="0.01" value={form.aliquota_ipi ?? ""} onChange={(e) => setForm({ ...form, aliquota_ipi: e.target.value ? Number(e.target.value) : null })} /></div>
              </div>
            </TabsContent>
            <TabsContent value="erp" className="space-y-4">
              <p className="text-sm text-slate-500">Vincule este produto ao seu ERP para sincronização posterior.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sistema ERP</Label>
                  <Select value={form.erp_system ?? "none"} onValueChange={(v) => setForm({ ...form, erp_system: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      <SelectItem value="sap">SAP</SelectItem>
                      <SelectItem value="totvs">TOTVS Protheus</SelectItem>
                      <SelectItem value="omie">Omie</SelectItem>
                      <SelectItem value="conta_azul">Conta Azul</SelectItem>
                      <SelectItem value="bling">Bling</SelectItem>
                      <SelectItem value="sankhya">Sankhya</SelectItem>
                      <SelectItem value="oracle">Oracle</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Código no ERP</Label><Input value={form.erp_code ?? ""} onChange={(e) => setForm({ ...form, erp_code: e.target.value })} /></div>
                <div className="col-span-2"><Label>ID externo (UUID/PK do ERP)</Label><Input value={form.erp_external_id ?? ""} onChange={(e) => setForm({ ...form, erp_external_id: e.target.value })} /></div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending || !form.company_id || !form.codigo || !form.descricao}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
