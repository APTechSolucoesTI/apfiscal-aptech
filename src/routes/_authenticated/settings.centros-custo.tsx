import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getOrgSettings } from "@/lib/organization.functions";
import {
  listCentrosCusto, saveCentroCusto, toggleCentroCustoAtivo, deleteCentroCusto,
  type CentroCustoInput,
} from "@/lib/centros-custo.functions";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Loader2, Wallet, Upload } from "lucide-react";
import { toast } from "sonner";
import { ImportXlsxDialog, type ImportField } from "@/components/import/ImportXlsxDialog";

const ccImportFields: ImportField[] = [
  { key: "codigo", label: "Código", required: true, aliases: ["codigo", "cod", "codigocentrocusto", "centrocusto"] },
  { key: "descricao", label: "Descrição", required: true, aliases: ["descricao", "nome", "titulo"] },
  { key: "ativo", label: "Ativo", aliases: ["status", "ativo", "situacao"] },
];

function parseAtivo(v: unknown): boolean {
  if (v == null || v === "") return true;
  if (typeof v === "boolean") return v;
  return ["1", "true", "sim", "ativo", "s", "y", "yes"].includes(String(v).trim().toLowerCase());
}

function normalizeCodigoCC(raw: unknown): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length !== 6) throw new Error("Código deve ter 6 dígitos (99.9999)");
  return `${d.slice(0, 2)}.${d.slice(2)}`;
}

export const Route = createFileRoute("/_authenticated/settings/centros-custo")({
  component: CentrosCustoPage,
  head: () => ({
    meta: [
      { title: "Centros de Custo | APFiscal" },
      { name: "description", content: "Cadastro de Centros de Custo por empresa para rateio de NF-e." },
      { property: "og:title", content: "Centros de Custo | APFiscal" },
      { property: "og:description", content: "Gerencie os Centros de Custo utilizados no rateio das NF-e." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function maskCodigoCC(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").slice(0, 6);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}.${d.slice(2)}`;
}

const GLOBAL = "__global__";

function CentrosCustoPage() {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativos" | "inativos">("todos");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmInativar, setConfirmInativar] = useState<any | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState<any | null>(null);
  const [form, setForm] = useState<CentroCustoInput>({ company_id: null, codigo: "", descricao: "", ativo: true });

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

  const listFn = useServerFn(listCentrosCusto);
  const saveFn = useServerFn(saveCentroCusto);
  const toggleFn = useServerFn(toggleCentroCustoAtivo);
  const delFn = useServerFn(deleteCentroCusto);

  const isGlobalView = companyId === GLOBAL;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["centros-custo", companyId],
    enabled: !!companyId,
    queryFn: () => listFn({ data: isGlobalView ? {} : { companyId } }),
  });

  const companyName = (id: string | null) => {
    if (!id) return "🌐 Global";
    const c = (companies as any[]).find((x) => x.id === id);
    return c ? (c.nome_fantasia ?? c.razao_social) : "—";
  };

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (rows as any[])
      .filter((r) => {
        if (statusFilter === "ativos" && !r.ativo) return false;
        if (statusFilter === "inativos" && r.ativo) return false;
        if (!s) return true;
        return r.codigo.toLowerCase().includes(s) || r.descricao.toLowerCase().includes(s);
      })
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [rows, search, statusFilter]);

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { ...form, company_id: form.company_id ?? null, codigo: form.codigo } }),
    onSuccess: () => {
      toast.success(form.id ? "Centro de Custo atualizado" : "Centro de Custo criado");
      qc.invalidateQueries({ queryKey: ["centros-custo"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => toggleFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["centros-custo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Centro de Custo excluído");
      setConfirmExcluir(null);
      qc.invalidateQueries({ queryKey: ["centros-custo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    const defaultCompany = isGlobalView ? null : (companyId || null);
    setForm({ company_id: defaultCompany, codigo: "", descricao: "", ativo: true });
    setOpen(true);
  }
  function openEdit(r: any) {
    setForm({ id: r.id, company_id: r.company_id ?? null, codigo: r.codigo, descricao: r.descricao, ativo: r.ativo });
    setOpen(true);
  }


  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" /> Centros de Custo
        </h1>
        <p className="text-sm text-slate-500">Cadastros financeiros para rateio de despesas nas NF-e.</p>
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
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativos">Ativos</SelectItem>
                  <SelectItem value="inativos">Inativos</SelectItem>
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
              <Button onClick={openNew} disabled={!companyId}><Plus className="h-4 w-4 mr-1" /> Novo Centro de Custo</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-56">Empresa</TableHead>
                <TableHead className="w-32">Ativo</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Nenhum centro de custo cadastrado.</TableCell></TableRow>
              ) : filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.codigo}</TableCell>
                  <TableCell>{r.descricao}</TableCell>
                  <TableCell className="text-sm text-slate-600">{companyName(r.company_id ?? null)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={r.ativo}
                        onCheckedChange={(v) => {
                          if (!v) setConfirmInativar(r);
                          else toggleMut.mutate({ id: r.id, ativo: true });
                        }}
                      />
                      <Badge variant="secondary" className={r.ativo ? "bg-green-100 text-green-800 border-green-200" : "bg-slate-100 text-slate-600 border-slate-200"}>
                        {r.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setConfirmExcluir(r)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ImportXlsxDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Centros de Custo via Excel"
        description={isGlobal
          ? "Os registros podem ser globais (todas as empresas) ou de uma empresa específica. As colunas são mapeadas automaticamente."
          : "Selecione a empresa e envie a planilha. As colunas são mapeadas automaticamente."}
        fields={ccImportFields}
        companies={(companies as any[]).map((c) => ({ id: c.id, label: c.nome_fantasia ?? c.razao_social }))}
        allowGlobal={isGlobal}
        requireCompanySelection={!isGlobal}
        buildRow={(m, ctx) => {
          if (!isGlobal && !ctx.companyId) throw new Error("Selecione uma empresa antes de importar");
          const codigo = normalizeCodigoCC(m.codigo);
          const descricao = String(m.descricao ?? "").trim();
          if (!descricao) throw new Error("Descrição obrigatória");
          return { company_id: ctx.companyId ?? null, codigo, descricao, ativo: parseAtivo(m.ativo) } as CentroCustoInput;
        }}
        checkDuplicate={async (row) => {
          let q = supabase
            .from("centros_custo")
            .select("id", { count: "exact", head: true })
            .eq("codigo", row.codigo);
          q = row.company_id ? q.eq("company_id", row.company_id) : q.is("company_id", null);
          const { count, error } = await q;
          if (error) return false;
          return (count ?? 0) > 0;
        }}
        onImportRow={async (row) => { await saveFn({ data: row }); }}
        onDone={() => qc.invalidateQueries({ queryKey: ["centros-custo"] })}
      />




      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar" : "Novo"} Centro de Custo</DialogTitle>
            <DialogDescription>Preencha os campos abaixo. Código no formato 99.9999.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Código *</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: maskCodigoCC(e.target.value) })}
                placeholder="01.0001"
                maxLength={7}
                className="font-mono"
              />
              {form.codigo && !/^\d{2}\.\d{4}$/.test(form.codigo) && (
                <p className="text-xs text-red-600 mt-1">Formato inválido. Use 99.9999</p>
              )}
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !/^\d{2}\.\d{4}$/.test(form.codigo) || !form.descricao.trim()}
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmInativar} onOpenChange={(o) => !o && setConfirmInativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar Centro de Custo?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao inativar, este Centro de Custo deixará de aparecer como opção em novos lançamentos.
              Os lançamentos já existentes NÃO serão alterados.
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
            <AlertDialogTitle>Excluir Centro de Custo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Se houver vínculos em NF-e, a exclusão será bloqueada — nesse caso, inative o registro.
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
