import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listSuppliers, saveSupplier, deleteSupplier, type SupplierInput } from "@/lib/suppliers.functions";
import { fetchCompanyByCnpj, fetchAddressByCep } from "@/lib/companies.functions";
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
import { Plus, Pencil, Trash2, Search, Building2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ImportXlsxDialog, type ImportField } from "@/components/import/ImportXlsxDialog";
import { onlyDigits as digitsOnly } from "@/lib/br-format";

export const Route = createFileRoute("/_authenticated/suppliers")({
  component: SuppliersPage,
  head: () => ({
    meta: [
      { title: "Fornecedores | APFiscal" },
      { name: "description", content: "Cadastro e listagem de fornecedores por empresa com vínculo a ERPs." },
      { property: "og:title", content: "Fornecedores | APFiscal" },
      { property: "og:description", content: "Gerencie fornecedores por empresa e integre com seu ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const empty: SupplierInput = {
  company_id: "",
  cnpj_cpf: "",
  tipo_pessoa: "juridica",
  razao_social: "",
};

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
      const { data, error } = await supabase.from("companies").select("id, razao_social, cnpj").order("razao_social");
      if (error) throw error;
      return data;
    },
  });

  const list = useServerFn(listSuppliers);
  const save = useServerFn(saveSupplier);
  const remove = useServerFn(deleteSupplier);
  const lookupCnpj = useServerFn(fetchCompanyByCnpj);
  const lookupCep = useServerFn(fetchAddressByCep);
  const [lookingUp, setLookingUp] = useState<"cnpj" | "cep" | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: () => list({ data: { companyId: companyId === "all" ? undefined : companyId } }),
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

  function openNew() {
    setForm({ ...empty, company_id: companyId !== "all" ? companyId : (companies[0]?.id ?? "") });
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
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Fornecedor</Button>
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
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por CNPJ ou razão social" className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Razão Social</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>ERP</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Nenhum fornecedor cadastrado.</TableCell></TableRow>
              ) : filtered.map((f: any) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">{maskCnpjCpf(f.cnpj_cpf ?? "")}</TableCell>
                  <TableCell>
                    <div className="font-medium">{f.razao_social}</div>
                    {f.nome_fantasia && <div className="text-xs text-slate-500">{f.nome_fantasia}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{f.companies?.razao_social ?? "—"}</TableCell>
                  <TableCell>
                    {f.erp_system ? (
                      <div className="text-xs">
                        <div className="font-medium">{f.erp_system}</div>
                        <div className="text-slate-500 font-mono">{f.erp_code ?? f.erp_external_id ?? "—"}</div>
                      </div>
                    ) : <Badge variant="outline">Não vinculado</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.origem === "auto_nfe" ? "secondary" : "outline"}>
                      {f.origem === "auto_nfe" ? "Auto (NF-e)" : f.origem === "erp" ? "ERP" : "Manual"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir fornecedor?")) delMut.mutate(f.id); }}>
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
            <DialogTitle>{form.id ? "Editar" : "Novo"} Fornecedor</DialogTitle>
            <DialogDescription>Cadastre um fornecedor vinculado à empresa e opcionalmente ao ERP.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="endereco">Endereço</TabsTrigger>
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
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending || !form.company_id || !form.cnpj_cpf || !form.razao_social}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
