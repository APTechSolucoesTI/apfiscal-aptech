"use client";

import { useMemo, useState, useEffect, type ReactNode } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/api-action";
import { supabase } from "@/integrations/supabase/client";
import { listSuppliers, saveSupplier, deleteSupplier, deleteSuppliers, type SupplierInput } from "@/lib/client-actions";
import { listSupplierFiscalDocuments } from "@/lib/client-actions";
import { getOrgSettings } from "@/lib/client-actions";
import { Checkbox } from "@/components/ui/checkbox";

import { fetchCompanyByCnpj, fetchAddressByCep } from "@/lib/client-actions";
import { maskCnpj, maskCpf, maskCnpjCpf, maskCep, onlyDigits, isValidCnpj, isValidCpf } from "@/lib/br-format";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Search, Building2, Loader2, Upload, ReceiptText, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ImportXlsxDialog, type ImportField } from "@/components/import/ImportXlsxDialog";
import { onlyDigits as digitsOnly } from "@/lib/br-format";
import { useColumnPreferences, type ColumnDef } from "@/hooks/use-column-preferences";
import { ColumnSettings } from "@/components/common/ColumnSettings";
import { TablePagination } from "@/components/common/TablePagination";

const empty: SupplierInput = {
  company_id: null,
  cnpj_cpf: "",
  tipo_pessoa: "juridica",
  razao_social: "",
};

const supplierImportFields: ImportField[] = [
  { key: "cnpj_cpf", label: "CNPJ/CPF", required: true, aliases: ["cnpj", "cpf", "documento", "doc"] },
  { key: "razao_social", label: "Razão Social", required: true, aliases: ["razaosocial", "nome", "empresa", "fornecedor"] },
  { key: "nome_fantasia", label: "Nome Fantasia", aliases: ["fantasia", "apelido"] },
  { key: "email", label: "E-mail", aliases: ["email", "mail"] },
  { key: "telefone", label: "Telefone", aliases: ["fone", "celular", "tel"] },
  { key: "inscricao_estadual", label: "Inscrição Estadual", aliases: ["ie", "inscricaoestadual"] },
  { key: "inscricao_municipal", label: "Inscrição Municipal", aliases: ["im", "inscricaomunicipal"] },
  { key: "cep", label: "CEP" },
  { key: "logradouro", label: "Logradouro", aliases: ["endereco", "rua"] },
  { key: "numero", label: "Número", aliases: ["num", "numero"] },
  { key: "complemento", label: "Complemento" },
  { key: "bairro", label: "Bairro" },
  { key: "municipio", label: "Município", aliases: ["cidade", "municipio"] },
  { key: "uf", label: "UF", aliases: ["estado", "uf"] },
  { key: "erp_system", label: "Sistema ERP", aliases: ["erp"] },
  { key: "erp_code", label: "Código no ERP", aliases: ["codigoerp", "erpcode"] },
];

type SupplierFiscalDocument = {
  id: string;
  numero: string;
  serie: string | null;
  chave_acesso: string;
  data_emissao: string | null;
  valor_total: number | null;
  tipo_operacao: string | null;
  situacao: string | null;
  status: string | null;
  company_id: string;
  companies?: { razao_social: string | null; nome_fantasia: string | null } | null;
};

function formatCurrency(value: number | null) {
  return value == null ? "—" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function SuppliersPage() {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<SupplierInput>(empty);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, razao_social, nome_fantasia, cnpj").order("razao_social");
      if (error) throw error;
      return data;
    },
  });

  const orgSettingsFn = useServerFn(getOrgSettings);
  const { data: orgSettings } = useQuery({ queryKey: ["org-settings"], queryFn: () => orgSettingsFn() });
  const isGlobal = orgSettings?.catalog_scope === "global";

  const list = useServerFn(listSuppliers);
  const listFiscalDocuments = useServerFn(listSupplierFiscalDocuments);
  const save = useServerFn(saveSupplier);
  const remove = useServerFn(deleteSupplier);
  const removeMany = useServerFn(deleteSuppliers);
  const lookupCnpj = useServerFn(fetchCompanyByCnpj);
  const lookupCep = useServerFn(fetchAddressByCep);
  const [lookingUp, setLookingUp] = useState<"cnpj" | "cep" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: () => list({ data: { companyId: companyId === "all" ? undefined : companyId } }),
  });

  const supplierDocuments = useQuery({
    queryKey: ["supplier-fiscal-documents", form.id],
    queryFn: () => listFiscalDocuments({ data: { supplierId: form.id! } }) as Promise<SupplierFiscalDocument[]>,
    enabled: open && Boolean(form.id),
  });

  const saveMut = useMutation({
    mutationFn: (payload: SupplierInput) => save({ data: payload }),
    onSuccess: () => {
      toast.success("Fornecedor salvo com sucesso");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setOpen(false);
      setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Fornecedor excluído");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDelMut = useMutation({
    mutationFn: (ids: string[]) => removeMany({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`${r.count} fornecedor(es) excluído(s)`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return suppliers.filter((f: any) =>
      !s ||
      f.razao_social?.toLowerCase().includes(s) ||
      onlyDigits(f.cnpj_cpf ?? "").includes(onlyDigits(s)) && onlyDigits(s).length > 0 ||
      f.cnpj_cpf?.includes(s) ||
      f.nome_fantasia?.toLowerCase().includes(s),
    );
  }, [suppliers, search]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((f: any) => f.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (visible.has(id)) next.add(id); });
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [filtered]);

  const allChecked = filtered.length > 0 && filtered.every((f: any) => selectedIds.has(f.id));
  const someChecked = selectedIds.size > 0 && !allChecked;
  function toggleAll() {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((f: any) => f.id)));
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
    if (!confirm(`Excluir ${selectedIds.size} fornecedor(es) selecionado(s)?`)) return;
    bulkDelMut.mutate(Array.from(selectedIds));
  }

  type Col = ColumnDef & { className?: string; headClassName?: string; render: (r: any) => ReactNode };
  const columns: Col[] = [
    { key: "cnpj_cpf", label: "CNPJ/CPF", className: "font-mono text-xs", render: (f) => maskCnpjCpf(f.cnpj_cpf ?? "") },
    { key: "razao_social", label: "Razão Social", render: (f) => (
      <>
        <div className="font-medium">{f.razao_social}</div>
        {f.nome_fantasia && <div className="text-xs text-slate-500">{f.nome_fantasia}</div>}
      </>
    ) },
    { key: "empresa", label: "Empresa", className: "text-xs", render: (f) => f.company_id ? (f.companies?.razao_social ?? "—") : <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">🌐 Global</Badge> },
    { key: "email", label: "E-mail", className: "text-xs text-slate-600", render: (f) => f.email ?? "—" },
    { key: "telefone", label: "Telefone", className: "text-xs text-slate-600", render: (f) => f.telefone ?? "—" },
    { key: "cidade_uf", label: "Cidade / UF", className: "text-xs text-slate-600", render: (f) => [f.municipio, f.uf].filter(Boolean).join(" / ") || "—" },
    { key: "erp", label: "ERP", render: (f) => f.erp_system ? (
      <div className="text-xs">
        <div className="font-medium">{f.erp_system}</div>
        <div className="text-slate-500 font-mono">{f.erp_code ?? f.erp_external_id ?? "—"}</div>
      </div>
    ) : <Badge variant="outline">Não vinculado</Badge> },
    { key: "origem", label: "Origem", render: (f) => (
      <Badge variant={f.origem === "auto_nfe" ? "secondary" : "outline"}>
        {f.origem === "auto_nfe" ? "Auto (NF-e)" : f.origem === "erp" ? "ERP" : "Manual"}
      </Badge>
    ) },
    { key: "actions", label: "Ações", alwaysVisible: true, headClassName: "w-24 text-right", className: "text-right", render: (f) => (
      <>
        <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir fornecedor?")) delMut.mutate(f.id); }}>
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
      </>
    ) },
  ];

  const { visibleColumns, allColumns, isVisible, toggleVisible, moveColumn, reset, pageSize, setPageSize } = useColumnPreferences("suppliers", columns);
  const visibleCols = visibleColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean);
  const orderedCols = allColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, companyId, pageSize, filtered.length]);
  const pagedFiltered = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);



  function openNew() {
    const defaultCompany = isGlobal ? null : (companyId !== "all" ? companyId : (companies[0]?.id ?? null));
    setForm({ ...empty, company_id: defaultCompany });
    setOpen(true);
  }

  function openEdit(f: any) {
    setForm({
      id: f.id,
      company_id: f.company_id,
      cnpj_cpf: f.cnpj_cpf,
      tipo_pessoa: f.tipo_pessoa,
      razao_social: f.razao_social,
      nome_fantasia: f.nome_fantasia,
      inscricao_estadual: f.inscricao_estadual,
      inscricao_municipal: f.inscricao_municipal,
      email: f.email,
      telefone: f.telefone,
      cep: f.cep,
      logradouro: f.logradouro,
      numero: f.numero,
      complemento: f.complemento,
      bairro: f.bairro,
      municipio: f.municipio,
      uf: f.uf,
      erp_system: f.erp_system,
      erp_code: f.erp_code,
      erp_external_id: f.erp_external_id,
    });
    setOpen(true);
  }

  const isPJ = (form.tipo_pessoa ?? "juridica") === "juridica";

  function handleDocChange(value: string) {
    const masked = isPJ ? maskCnpj(value) : maskCpf(value);
    setForm((prev) => ({ ...prev, cnpj_cpf: masked }));
  }

  async function handleDocBlur() {
    const clean = onlyDigits(form.cnpj_cpf);
    if (!isPJ) {
      if (clean.length === 11 && !isValidCpf(clean)) toast.error("CPF inválido.");
      return;
    }
    if (clean.length !== 14) return;
    if (!isValidCnpj(clean)) {
      toast.error("CNPJ inválido.");
      return;
    }
    try {
      setLookingUp("cnpj");
      const c = await lookupCnpj({ data: { cnpj: clean } });
      setForm((prev) => ({
        ...prev,
        razao_social: prev.razao_social || c.nome || "",
        nome_fantasia: prev.nome_fantasia || c.fantasia || null,
        email: prev.email || c.email || null,
        telefone: prev.telefone || c.telefone || null,
        inscricao_estadual: prev.inscricao_estadual || c.inscricao_estadual || null,
        cep: prev.cep || (c.cep ? maskCep(c.cep) : null),
        logradouro: prev.logradouro || c.logradouro || null,
        numero: prev.numero || c.numero || null,
        bairro: prev.bairro || c.bairro || null,
        municipio: prev.municipio || c.municipio || null,
        uf: prev.uf || c.uf || null,
      }));
      toast.success("Dados do CNPJ carregados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar CNPJ.");
    } finally {
      setLookingUp(null);
    }
  }

  async function handleCepBlur() {
    const clean = onlyDigits(form.cep ?? "");
    if (clean.length !== 8) return;
    try {
      setLookingUp("cep");
      const addr: any = await lookupCep({ data: { cep: clean } });
      setForm((prev) => ({
        ...prev,
        logradouro: addr.street || prev.logradouro || null,
        bairro: addr.neighborhood || prev.bairro || null,
        municipio: addr.city || prev.municipio || null,
        uf: addr.state || prev.uf || null,
      }));
    } catch {
      toast.error("Erro ao buscar CEP.");
    } finally {
      setLookingUp(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fornecedores</h1>
          <p className="text-sm text-slate-500">Cadastro de fornecedores por empresa com vínculo a ERPs.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!isGlobal && companies.length === 0}>
            <Upload className="h-4 w-4 mr-1" /> Importar XLSX
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Fornecedor</Button>
        </div>
      </div>

      <ImportXlsxDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Fornecedores via Excel"
        description={isGlobal
          ? "Selecione se os fornecedores serão compartilhados por todas as empresas (Global) ou vinculados a uma empresa específica."
          : "Selecione a empresa em que os fornecedores serão cadastrados."}
        fields={supplierImportFields}
        companies={companies.map((c: any) => ({ id: c.id, label: `${c.razao_social}${c.nome_fantasia ? ` (${c.nome_fantasia})` : ""}` }))}
        allowGlobal={isGlobal}
        requireCompanySelection={!isGlobal}
        buildRow={(m, ctx) => {
          const cid = ctx.companyId;
          if (!isGlobal && !cid) throw new Error("Selecione uma empresa antes de importar");
          const doc = digitsOnly(String(m.cnpj_cpf ?? ""));
          if (!doc) throw new Error("CNPJ/CPF obrigatório");
          if (!m.razao_social) throw new Error("Razão social obrigatória");
          return {
            company_id: cid,
            cnpj_cpf: doc,
            tipo_pessoa: doc.length === 14 ? "juridica" : "fisica",
            razao_social: String(m.razao_social),
            nome_fantasia: m.nome_fantasia ? String(m.nome_fantasia) : null,
            email: m.email ? String(m.email) : null,
            telefone: m.telefone ? String(m.telefone) : null,
            inscricao_estadual: m.inscricao_estadual ? String(m.inscricao_estadual) : null,
            inscricao_municipal: m.inscricao_municipal ? String(m.inscricao_municipal) : null,
            cep: m.cep ? digitsOnly(String(m.cep)) : null,
            logradouro: m.logradouro ? String(m.logradouro) : null,
            numero: m.numero ? String(m.numero) : null,
            complemento: m.complemento ? String(m.complemento) : null,
            bairro: m.bairro ? String(m.bairro) : null,
            municipio: m.municipio ? String(m.municipio) : null,
            uf: m.uf ? String(m.uf).toUpperCase().slice(0, 2) : null,
            erp_system: m.erp_system ? String(m.erp_system) : null,
            erp_code: m.erp_code ? String(m.erp_code) : null,
          } as SupplierInput;
        }}
        checkDuplicate={async (row) => {
          const q = supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("cnpj_cpf", row.cnpj_cpf);
          const scoped = row.company_id ? q.eq("company_id", row.company_id) : q.is("company_id", null);
          const { count, error } = await scoped;
          if (error) return false;
          return (count ?? 0) > 0;
        }}
        onImportRow={async (row) => { await save({ data: row }); }}
        onDone={() => qc.invalidateQueries({ queryKey: ["suppliers"] })}
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
                  {companies.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.razao_social}{c.nome_fantasia ? ` (${c.nome_fantasia})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por CNPJ ou razão social" className="pl-9" />
              </div>
              <ColumnSettings columns={orderedCols} isVisible={isVisible} toggleVisible={toggleVisible} moveColumn={moveColumn} reset={reset} pageSize={pageSize} onPageSizeChange={setPageSize} />
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
                {visibleCols.map((c) => (
                  <TableHead key={c.key} className={c.headClassName}>{c.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={visibleCols.length + 1} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={visibleCols.length + 1} className="text-center py-8 text-slate-500">Nenhum fornecedor cadastrado.</TableCell></TableRow>
              ) : pagedFiltered.map((f: any) => (
                <TableRow key={f.id} data-state={selectedIds.has(f.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(f.id)}
                      onCheckedChange={() => toggleRow(f.id)}
                      aria-label={`Selecionar ${f.razao_social}`}
                    />
                  </TableCell>
                  {visibleCols.map((c) => (
                    <TableCell key={c.key} className={c.className}>{c.render(f)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </CardContent>

      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar" : "Novo"} Fornecedor</DialogTitle>
            <DialogDescription>Cadastre um fornecedor vinculado à empresa e opcionalmente ao ERP.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="endereco">Endereço</TabsTrigger>
              <TabsTrigger value="erp">Integração ERP</TabsTrigger>
              {form.id && <TabsTrigger value="notas">Notas Fiscais</TabsTrigger>}
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
                      {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.razao_social}{c.nome_fantasia ? ` (${c.nome_fantasia})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de pessoa</Label>
                  <Select value={form.tipo_pessoa} onValueChange={(v) => setForm({ ...form, tipo_pessoa: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="juridica">Jurídica</SelectItem>
                      <SelectItem value="fisica">Física</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isPJ ? "CNPJ" : "CPF"} *</Label>
                  <div className="relative">
                    <Input
                      value={form.cnpj_cpf}
                      onChange={(e) => handleDocChange(e.target.value)}
                      onBlur={handleDocBlur}
                      placeholder={isPJ ? "00.000.000/0000-00" : "000.000.000-00"}
                      maxLength={isPJ ? 18 : 14}
                      className="font-mono"
                    />
                    {lookingUp === "cnpj" && <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3 text-slate-400" />}
                  </div>
                </div>
                <div>
                  <Label>Inscrição Estadual</Label>
                  <Input value={form.inscricao_estadual ?? ""} onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Razão Social *</Label>
                  <Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Nome Fantasia</Label>
                  <Input value={form.nome_fantasia ?? ""} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="endereco" className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>CEP</Label>
                  <div className="relative">
                    <Input
                      value={maskCep(form.cep ?? "")}
                      onChange={(e) => setForm({ ...form, cep: maskCep(e.target.value) })}
                      onBlur={handleCepBlur}
                      placeholder="00000-000"
                      maxLength={9}
                      className="font-mono"
                    />
                    {lookingUp === "cep" && <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3 text-slate-400" />}
                  </div>
                </div>
                <div className="col-span-2"><Label>Logradouro</Label><Input value={form.logradouro ?? ""} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} /></div>
                <div><Label>Número</Label><Input value={form.numero ?? ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
                <div className="col-span-2"><Label>Complemento</Label><Input value={form.complemento ?? ""} onChange={(e) => setForm({ ...form, complemento: e.target.value })} /></div>
                <div><Label>Bairro</Label><Input value={form.bairro ?? ""} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></div>
                <div><Label>Município</Label><Input value={form.municipio ?? ""} onChange={(e) => setForm({ ...form, municipio: e.target.value })} /></div>
                <div><Label>UF</Label><Input maxLength={2} value={form.uf ?? ""} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div>
              </div>
            </TabsContent>
            <TabsContent value="erp" className="space-y-4">
              <p className="text-sm text-slate-500">Vincule este fornecedor ao seu ERP para sincronização posterior.</p>
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
            {form.id && (
              <TabsContent value="notas" className="space-y-4">
                <div className="flex items-start justify-between gap-4 rounded-lg border bg-slate-50 p-4">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ReceiptText className="h-4 w-4 text-blue-600" />NF-e deste fornecedor</h3>
                    <p className="mt-1 text-xs text-slate-500">Vínculo interno do documento; cadastros antigos usam CNPJ/CPF normalizado como fallback.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 bg-white">{supplierDocuments.data?.length ?? 0} nota(s)</Badge>
                </div>
                {supplierDocuments.isLoading ? (
                  <div className="flex min-h-32 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando notas fiscais…</div>
                ) : supplierDocuments.isError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar as NF-e deste fornecedor.</div>
                ) : (supplierDocuments.data?.length ?? 0) === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center"><ReceiptText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-700">Nenhuma NF-e importada</p><p className="mt-1 text-xs text-slate-500">Quando um XML completo for importado, a nota aparecerá aqui.</p></div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table className="min-w-[760px]">
                      <TableHeader><TableRow><TableHead>Número / série</TableHead><TableHead>Emissão</TableHead><TableHead>Empresa</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Abrir</TableHead></TableRow></TableHeader>
                      <TableBody>{supplierDocuments.data?.map((document) => (
                        <TableRow key={document.id}>
                          <TableCell><div className="font-medium">{document.numero || "—"}{document.serie ? ` / ${document.serie}` : ""}</div><div className="max-w-44 truncate font-mono text-[11px] text-slate-500" title={document.chave_acesso}>{document.chave_acesso}</div></TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{document.data_emissao ? new Date(document.data_emissao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                          <TableCell className="max-w-48 truncate text-sm">{document.companies?.nome_fantasia || document.companies?.razao_social || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm font-medium">{formatCurrency(document.valor_total)}</TableCell>
                          <TableCell><Badge variant="outline">{document.status?.replaceAll("_", " ") || document.situacao || "Importada"}</Badge></TableCell>
                          <TableCell className="text-right"><Button asChild size="sm" variant="ghost"><Link href={`/documents/nfe/${document.id}`}><ExternalLink className="mr-1 h-3.5 w-3.5" />Detalhes</Link></Button></TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending || (!isGlobal && !form.company_id) || !form.cnpj_cpf || !form.razao_social}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SuppliersPage;
