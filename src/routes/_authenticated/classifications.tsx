import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listClassifications, saveClassification, deleteClassification,
  type ClassificationTable, type ClassificationInput,
} from "@/lib/classifications.functions";
import { getOrgSettings } from "@/lib/organization.functions";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, Search, Loader2, Layers, Upload } from "lucide-react";
import { toast } from "sonner";
import { ImportXlsxDialog, type ImportField } from "@/components/import/ImportXlsxDialog";

export const Route = createFileRoute("/_authenticated/classifications")({
  component: ClassificationsPage,
  head: () => ({
    meta: [
      { title: "Classificações | APFiscal" },
      { name: "description", content: "Cadastro de famílias, grupos e subgrupos para classificação de produtos." },
      { property: "og:title", content: "Classificações | APFiscal" },
      { property: "og:description", content: "Gerencie famílias, grupos e subgrupos de produtos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const LABELS: Record<ClassificationTable, string> = {
  familias: "Famílias",
  grupos: "Grupos",
  subgrupos: "Subgrupos",
};

function ClassificationsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Layers className="h-6 w-6 text-primary" /> Classificações de Produtos
        </h1>
        <p className="text-sm text-slate-500">Cadastros auxiliares usados na classificação hierárquica dos produtos.</p>
      </div>

      <Tabs defaultValue="familias">
        <TabsList>
          <TabsTrigger value="familias">Famílias</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="subgrupos">Subgrupos</TabsTrigger>
        </TabsList>
        {(["familias", "grupos", "subgrupos"] as ClassificationTable[]).map((t) => (
          <TabsContent key={t} value={t}>
            <ClassificationCrud tabela={t} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ClassificationCrud({ tabela }: { tabela: ClassificationTable }) {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<ClassificationInput>({
    tabela, company_id: null, codigo: "", descricao: "",
  });

  const importFields: ImportField[] = [
    { key: "codigo", label: "Código", required: true, aliases: ["cod", "codigo", "code"] },
    { key: "descricao", label: "Descrição", required: true, aliases: ["desc", "descricao", "nome", "name"] },
  ];

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies")
        .select("id, razao_social").order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const orgSettingsFn = useServerFn(getOrgSettings);
  const { data: orgSettings } = useQuery({ queryKey: ["org-settings"], queryFn: () => orgSettingsFn() });
  const isGlobal = orgSettings?.catalog_scope === "global";

  const listFn = useServerFn(listClassifications);
  const saveFn = useServerFn(saveClassification);
  const delFn = useServerFn(deleteClassification);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["classif", tabela, companyId],
    queryFn: () => listFn({ data: { tabela, companyId: companyId === "all" ? undefined : companyId } }),
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (rows as any[]).filter((r) => !s || r.codigo.toLowerCase().includes(s) || r.descricao.toLowerCase().includes(s));
  }, [rows, search]);

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { ...form, tabela } }),
    onSuccess: () => {
      toast.success(`${LABELS[tabela].slice(0, -1)} salva`);
      qc.invalidateQueries({ queryKey: ["classif", tabela] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { tabela, id } }),
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["classif", tabela] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setForm({ tabela, company_id: isGlobal ? null : (companyId !== "all" ? companyId : ((companies as any[])[0]?.id ?? null)), codigo: "", descricao: "" });
    setOpen(true);
  }
  function openEdit(r: any) {
    setForm({ id: r.id, tabela, company_id: r.company_id, codigo: r.codigo, descricao: r.descricao });
    setOpen(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex gap-2 items-center">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {(companies as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
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
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova {LABELS[tabela].slice(0, -1)}</Button>
          </div>
        </div>
      </CardHeader>

      <ImportXlsxDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title={`Importar ${LABELS[tabela]} via Excel`}
        description={isGlobal
          ? `Selecione se os registros serão compartilhados por todas as empresas (Global) ou vinculados a uma empresa específica.`
          : `Selecione a empresa em que os registros serão cadastrados.`}
        fields={importFields}
        companies={(companies as any[]).map((c) => ({ id: c.id, label: c.razao_social }))}
        allowGlobal={isGlobal}
        requireCompanySelection={!isGlobal}
        buildRow={(m, ctx) => {
          const cid = ctx.companyId;
          if (!isGlobal && !cid) throw new Error("Selecione uma empresa antes de importar");
          const codigo = String(m.codigo ?? "").trim();
          const descricao = String(m.descricao ?? "").trim();
          if (!codigo) throw new Error("Código obrigatório");
          if (!descricao) throw new Error("Descrição obrigatória");
          return { tabela, company_id: cid, codigo, descricao } as ClassificationInput;
        }}
        checkDuplicate={async (row) => {
          const q = supabase.from(tabela).select("id", { count: "exact", head: true }).eq("codigo", row.codigo);
          const scoped = row.company_id ? q.eq("company_id", row.company_id) : q.is("company_id", null);
          const { count, error } = await scoped;
          if (error) return false;
          return (count ?? 0) > 0;
        }}
        onImportRow={async (row) => { await saveFn({ data: row }); }}
        onDone={() => qc.invalidateQueries({ queryKey: ["classif", tabela] })}
      />
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">Nenhum registro.</TableCell></TableRow>
            ) : filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                <TableCell>{r.descricao}</TableCell>
                <TableCell className="text-xs text-slate-500">
                  {r.company_id ? ((companies as any[]).find((c) => c.id === r.company_id)?.razao_social ?? "—") : "🌐 Global"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir?")) delMut.mutate(r.id); }}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar" : "Nova"} {LABELS[tabela].slice(0, -1)}</DialogTitle>
            <DialogDescription>Preencha os campos abaixo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Empresa {isGlobal ? "" : "*"}</Label>
              <Select value={form.company_id ?? "__global__"}
                onValueChange={(v) => setForm({ ...form, company_id: v === "__global__" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {isGlobal && <SelectItem value="__global__">🌐 Global — Todas as empresas</SelectItem>}
                  {(companies as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Código *</Label>
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.codigo || !form.descricao}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
