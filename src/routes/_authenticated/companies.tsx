import { useMemo, useState, useEffect, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Search,
  Filter,
  Loader2,
  Info,
  ArrowUpDown,
  Pencil,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createFileRoute } from "@tanstack/react-router";
import { fetchCompanyByCnpj, fetchAddressByCep } from "@/lib/companies.functions";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useSortableData } from "@/hooks/use-sortable-data";
import { useColumnPreferences, type ColumnDef } from "@/hooks/use-column-preferences";
import { ColumnSettings } from "@/components/common/ColumnSettings";
import { TablePagination } from "@/components/common/TablePagination";
import { supabase } from "@/integrations/supabase/client";
import { IntegracaoFiscalForm } from "@/components/nfe/IntegracaoFiscalForm";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/companies")({
  component: Companies,
});

type CnaeItem = { code: string; text: string; main?: boolean };

type CompanyRow = {
  id: string;
  organization_id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  uf: string | null;
  regime_tributario: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  email: string | null;
  telefone: string | null;
  responsavel: string | null;
  cnae_principal: string | null;
  cnaes: CnaeItem[];
  created_at: string;
};

const emptyForm = {
  razao: "",
  fantasia: "",
  cnae: "",
  cnaes: [] as CnaeItem[],
  ie: "",
  im: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  uf: "",
  email: "",
  telefone: "",
  responsavel: "",
};

function formatCnpj(raw: string) {
  const c = raw.replace(/\D/g, "").padStart(14, "0").slice(-14);
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
}

function maskCnpj(raw: string) {
  const c = raw.replace(/\D/g, "").slice(0, 14);
  let out = c;
  if (c.length > 2) out = `${c.slice(0, 2)}.${c.slice(2)}`;
  if (c.length > 5) out = `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5)}`;
  if (c.length > 8) out = `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8)}`;
  if (c.length > 12) out = `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  return out;
}

function isValidCnpj(raw: string): boolean {
  const c = raw.replace(/\D/g, "");
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(c.slice(0, 12));
  const d2 = calc(c.slice(0, 12) + d1);
  return d1 === parseInt(c[12], 10) && d2 === parseInt(c[13], 10);
}

function maskCep(raw: string) {
  const c = raw.replace(/\D/g, "").slice(0, 8);
  if (c.length > 5) return `${c.slice(0, 5)}-${c.slice(5)}`;
  return c;
}

function Companies() {
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CompanyRow[];
    },
  });

  const [search, setSearch] = useState("");
  const filtered = companies.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.cnpj.toLowerCase().includes(q) ||
      c.razao_social.toLowerCase().includes(q) ||
      (c.nome_fantasia ?? "").toLowerCase().includes(q)
    );
  });
  const { items: sortedCompanies, requestSort } = useSortableData(filtered);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyRow | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [tab, setTab] = useState("cadastrais");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyRow | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ loading: boolean; count: number } | null>(null);

  const [cnpj, setCnpj] = useState("");
  const [isLoadingCnpj, setIsLoadingCnpj] = useState(false);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [formData, setFormData] = useState({ ...emptyForm });

  const getCompany = useServerFn(fetchCompanyByCnpj);
  const getAddress = useServerFn(fetchAddressByCep);

  const resetForm = () => {
    setCnpj("");
    setFormData({ ...emptyForm });
    setTab("cadastrais");
    setEditingId(null);
  };

  const openEdit = (c: CompanyRow) => {
    setEditingId(c.id);
    setCnpj(c.cnpj);
    setFormData({
      razao: c.razao_social ?? "",
      fantasia: c.nome_fantasia ?? "",
      cnae: c.cnae_principal ?? "",
      cnaes: (c.cnaes ?? []) as CnaeItem[],
      ie: c.inscricao_estadual ?? "",
      im: c.inscricao_municipal ?? "",
      cep: c.cep ?? "",
      logradouro: c.logradouro ?? "",
      numero: c.numero ?? "",
      complemento: c.complemento ?? "",
      bairro: c.bairro ?? "",
      municipio: c.municipio ?? "",
      uf: c.uf ?? "",
      email: c.email ?? "",
      telefone: c.telefone ?? "",
      responsavel: c.responsavel ?? "",
    });
    setTab("cadastrais");
    setIsAddDialogOpen(true);
  };

  const handleFetchCnpj = async (rawCnpj: string) => {
    const cleanCnpj = rawCnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) return;
    if (!isValidCnpj(cleanCnpj)) {
      toast.error("CNPJ inválido. Verifique os dígitos informados.");
      return;
    }
    const formatted = formatCnpj(cleanCnpj);
    const exists = companies.some((c) => c.cnpj.replace(/\D/g, "") === cleanCnpj && c.id !== editingId);
    if (exists) {
      toast.error("Já existe uma empresa cadastrada com este CNPJ.");
      return;
    }
    setIsLoadingCnpj(true);
    try {
      const data = await getCompany({ data: { cnpj: cleanCnpj } });
      setFormData((prev) => ({
        ...prev,
        razao: data.nome,
        fantasia: data.fantasia || "",
        uf: data.uf,
        municipio: data.municipio,
        logradouro: data.logradouro,
        numero: data.numero,
        bairro: data.bairro,
        cep: data.cep.replace(/\D/g, ""),
        email: data.email || "",
        telefone: data.telefone || "",
        cnae: data.atividades_economicas?.find((c) => c.main)?.text || "",
        cnaes: data.atividades_economicas || [],
        responsavel: data.responsavel || "",
        ie: data.inscricao_estadual || "",
        im: data.inscricao_municipal || "",
      }));
      toast.success("Dados da empresa carregados via CNPJ!");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao buscar CNPJ.");
    } finally {
      setIsLoadingCnpj(false);
    }
    void formatted;
  };

  const handleCnpjChange = (value: string) => {
    const masked = maskCnpj(value);
    setCnpj(masked);
    if (masked.replace(/\D/g, "").length === 14) {
      void handleFetchCnpj(masked);
    }
  };



  const handleCepBlur = async () => {
    const cleanCep = formData.cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    setIsLoadingCep(true);
    try {
      const data = await getAddress({ data: { cep: cleanCep } });
      setFormData((prev) => ({
        ...prev,
        logradouro: data.street,
        bairro: data.neighborhood,
        municipio: data.city,
        uf: data.state,
      }));
      toast.success("Endereço atualizado via CEP!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao buscar CEP.");
    } finally {
      setIsLoadingCep(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanCnpj = cnpj.replace(/\D/g, "");
      if (!isValidCnpj(cleanCnpj)) throw new Error("Informe um CNPJ válido.");
      if (companies.some((c) => c.cnpj.replace(/\D/g, "") === cleanCnpj && c.id !== editingId)) {
        throw new Error("Já existe uma empresa cadastrada com este CNPJ.");
      }
      if (!formData.razao.trim()) throw new Error("Razão Social é obrigatória.");
      if (!formData.uf.trim()) throw new Error("UF é obrigatória.");

      const basePayload = {
        cnpj: formatCnpj(cleanCnpj),
        razao_social: formData.razao.trim(),
        nome_fantasia: formData.fantasia || null,
        uf: formData.uf || null,
        inscricao_estadual: formData.ie || null,
        inscricao_municipal: formData.im || null,
        cep: formData.cep || null,
        logradouro: formData.logradouro || null,
        numero: formData.numero || null,
        complemento: formData.complemento || null,
        bairro: formData.bairro || null,
        municipio: formData.municipio || null,
        email: formData.email || null,
        telefone: formData.telefone || null,
        responsavel: formData.responsavel || null,
        cnae_principal: formData.cnae || null,
        cnaes: (formData.cnaes ?? []) as unknown as never,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from("companies")
          .update(basePayload as never)
          .eq("id", editingId)
          .select()
          .single();
        if (error) {
          const detail = [error.message, (error as { details?: string }).details, (error as { hint?: string }).hint]
            .filter(Boolean).join(" · ");
          throw new Error(detail || "Erro ao atualizar empresa.");
        }
        return { data, mode: "update" as const };
      }

      const { data: orgId, error: orgErr } = await supabase.rpc("ensure_user_organization");
      if (orgErr) throw new Error(orgErr.message || "Falha ao obter organização.");
      if (!orgId) throw new Error("Organização não encontrada para o usuário.");

      const payload = { ...basePayload, organization_id: orgId as unknown as string };
      const { data, error } = await supabase
        .from("companies")
        .insert(payload as never)
        .select()
        .single();
      if (error) {
        const detail = [error.message, (error as { details?: string }).details, (error as { hint?: string }).hint]
          .filter(Boolean).join(" · ");
        throw new Error(detail || "Erro ao salvar empresa.");
      }
      return { data, mode: "insert" as const };
    },
    onSuccess: (res) => {
      toast.success(res.mode === "update" ? "Empresa atualizada com sucesso!" : "Empresa cadastrada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erro ao salvar empresa.";
      if (msg.toLowerCase().includes("duplicate")) {
        toast.error("Esta empresa (CNPJ) já está cadastrada.");
      } else {
        toast.error(msg);
      }
    },
  });

  const requestDelete = async (company: CompanyRow) => {
    setDeleteTarget(company);
    setDeleteCheck({ loading: true, count: 0 });
    const { count, error } = await supabase
      .from("fiscal_documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id);
    if (error) {
      toast.error("Não foi possível verificar movimentações da empresa.");
      setDeleteTarget(null);
      setDeleteCheck(null);
      return;
    }
    setDeleteCheck({ loading: false, count: count ?? 0 });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa removida.");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setDeleteTarget(null);
      setDeleteCheck(null);
      setIsDetailsOpen(false);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Erro ao remover empresa.");
    },
  });

  type Col = ColumnDef & { sortKey?: keyof CompanyRow; className?: string; headClassName?: string; render: (r: CompanyRow) => ReactNode };
  const columns: Col[] = useMemo(() => [
    { key: "empresa", label: "Empresa", sortKey: "nome_fantasia", headClassName: "text-slate-500 font-semibold", render: (company) => (
      <div>
        <div className="font-medium text-slate-900">{company.nome_fantasia || company.razao_social}</div>
        <div className="text-xs text-slate-500 truncate max-w-[240px]">{company.razao_social}</div>
      </div>
    ) },
    { key: "cnpj", label: "CNPJ", sortKey: "cnpj", headClassName: "text-slate-500 font-semibold", className: "text-slate-600 font-mono text-xs", render: (c) => c.cnpj },
    { key: "uf", label: "UF", sortKey: "uf", headClassName: "text-slate-500 font-semibold", render: (c) => (
      <span className="inline-flex items-center rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{c.uf || "-"}</span>
    ) },
    { key: "municipio", label: "Município", headClassName: "text-slate-500 font-semibold", className: "text-slate-600 text-sm", render: (c) => c.municipio || "-" },
    { key: "ie", label: "Insc. Estadual", headClassName: "text-slate-500 font-semibold", className: "text-slate-600 text-xs", render: (c) => c.inscricao_estadual || "-" },
    { key: "regime", label: "Regime", headClassName: "text-slate-500 font-semibold", className: "text-slate-600 text-xs capitalize", render: (c) => c.regime_tributario || "-" },
    { key: "responsavel", label: "Responsável", headClassName: "text-slate-500 font-semibold", className: "text-slate-600 text-xs", render: (c) => c.responsavel || "-" },
    { key: "actions", label: "Ações", alwaysVisible: true, headClassName: "text-right text-slate-500 font-semibold", className: "text-right", render: (company) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" title="Editar empresa" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => openEdit(company)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Detalhes" className="h-8 w-8 text-slate-500 hover:bg-slate-100" onClick={() => { setSelectedCompany(company); setIsDetailsOpen(true); }}>
          <Info className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Excluir empresa" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => requestDelete(company)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    ) },
  ], [certByCompany]);

  const { visibleColumns, allColumns, isVisible, toggleVisible, moveColumn, reset, pageSize, setPageSize } = useColumnPreferences("companies", columns);
  const visibleCols = useMemo(() => visibleColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean), [visibleColumns, columns]);
  const orderedCols = useMemo(() => allColumns.map((c) => columns.find((x) => x.key === c.key)!).filter(Boolean), [allColumns, columns]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, pageSize, sortedCompanies.length]);
  const pagedCompanies = useMemo(() => sortedCompanies.slice((page - 1) * pageSize, page * pageSize), [sortedCompanies, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empresas (CNPJs)</h1>
          <p className="text-slate-500">Gerencie as empresas e filiais da sua organização.</p>
        </div>
        <Dialog
          open={isAddDialogOpen}
          onOpenChange={(o) => {
            setIsAddDialogOpen(o);
            if (!o) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> Nova Empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="text-xl flex items-center gap-2">
                {editingId ? <Pencil className="h-5 w-5 text-blue-600" /> : <Plus className="h-5 w-5 text-blue-600" />}
                {editingId ? "Editar Empresa" : "Cadastrar Nova Empresa"}
              </DialogTitle>
              <DialogDescription>
                Utilizamos o BrasilAPI para preencher os dados automaticamente via CNPJ e CEP.
              </DialogDescription>
            </DialogHeader>

            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 border-b">
                <TabsList className="w-full justify-start rounded-none h-12 bg-transparent gap-6 p-0">
                  <TabsTrigger value="cadastrais" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none">
                    Dados Cadastrais
                  </TabsTrigger>
                  <TabsTrigger value="endereco" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none">
                    Endereço
                  </TabsTrigger>
                  <TabsTrigger value="fiscais" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none">
                    Dados Fiscais
                  </TabsTrigger>
                  <TabsTrigger value="integracao" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent shadow-none">
                    Integração Fiscal (NF-e)
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-6">
                  <TabsContent value="cadastrais" className="mt-0 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="cnpj">CNPJ <span className="text-red-500">*</span></Label>
                        <div className="relative">
                          <Input
                            id="cnpj"
                            placeholder="00.000.000/0000-00"
                            value={cnpj}
                            onChange={(e) => handleCnpjChange(e.target.value)}
                            onBlur={() => handleFetchCnpj(cnpj)}
                            className="font-mono"
                            maxLength={18}
                          />
                          {isLoadingCnpj && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="razao">Razão Social <span className="text-red-500">*</span></Label>
                        <Input id="razao" value={formData.razao} onChange={(e) => setFormData({ ...formData, razao: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="fantasia">Nome Fantasia</Label>
                        <Input id="fantasia" value={formData.fantasia} onChange={(e) => setFormData({ ...formData, fantasia: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="responsavel">Responsável pela Empresa</Label>
                        <Input id="responsavel" value={formData.responsavel} onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">E-mail do Responsável</Label>
                        <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="telefone">Telefone</Label>
                        <Input id="telefone" value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="ie">Inscrição Estadual</Label>
                        <Input id="ie" value={formData.ie} onChange={(e) => setFormData({ ...formData, ie: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="im">Inscrição Municipal</Label>
                        <Input id="im" value={formData.im} onChange={(e) => setFormData({ ...formData, im: e.target.value })} />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="endereco" className="mt-0 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="cep">CEP <span className="text-red-500">*</span></Label>
                        <div className="relative">
                          <Input id="cep" placeholder="00000-000" value={maskCep(formData.cep)} onChange={(e) => setFormData({ ...formData, cep: maskCep(e.target.value) })} onBlur={handleCepBlur} className="font-mono" maxLength={9} />
                          {isLoadingCep && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-2 md:col-span-2">
                        <Label htmlFor="logradouro">Logradouro <span className="text-red-500">*</span></Label>
                        <Input id="logradouro" value={formData.logradouro} onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="numero">Número <span className="text-red-500">*</span></Label>
                        <Input id="numero" value={formData.numero} onChange={(e) => setFormData({ ...formData, numero: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="complemento">Complemento</Label>
                        <Input id="complemento" value={formData.complemento} onChange={(e) => setFormData({ ...formData, complemento: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="bairro">Bairro <span className="text-red-500">*</span></Label>
                        <Input id="bairro" value={formData.bairro} onChange={(e) => setFormData({ ...formData, bairro: e.target.value })} />
                      </div>
                      <div className="grid gap-2 md:col-span-2">
                        <Label htmlFor="municipio">Cidade <span className="text-red-500">*</span></Label>
                        <Input id="municipio" value={formData.municipio} onChange={(e) => setFormData({ ...formData, municipio: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="uf">UF <span className="text-red-500">*</span></Label>
                        <Input id="uf" value={formData.uf} maxLength={2} onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })} />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="fiscais" className="mt-0 space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <Info className="h-4 w-4 text-blue-600" />
                          CNAEs (Atividades Econômicas)
                        </div>
                        {formData.cnaes && formData.cnaes.length > 0 && (
                          <Badge variant="outline" className="text-slate-600">
                            {formData.cnaes.length} {formData.cnaes.length === 1 ? "atividade" : "atividades"}
                          </Badge>
                        )}
                      </div>
                      <div className="border rounded-md divide-y overflow-hidden">
                        {formData.cnaes && formData.cnaes.length > 0 ? (
                          [...formData.cnaes]
                            .sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0))
                            .map((cnae, index) => (
                              <div
                                key={index}
                                className={`p-3 flex items-start gap-3 transition-colors ${
                                  cnae.main
                                    ? "bg-blue-50 border-l-4 border-l-blue-600 hover:bg-blue-100"
                                    : "bg-white hover:bg-slate-50"
                                }`}
                              >
                                <div className="mt-1">
                                  {cnae.main ? (
                                    <Badge className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap">
                                      ★ Principal
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-slate-500 whitespace-nowrap">
                                      Secundário
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className={`text-sm font-mono font-semibold ${cnae.main ? "text-blue-900" : "text-slate-700"}`}>
                                    {cnae.code}
                                  </div>
                                  <div className={`text-sm break-words ${cnae.main ? "text-blue-800 font-medium" : "text-slate-600"}`}>
                                    {cnae.text}
                                  </div>
                                </div>
                              </div>
                            ))
                        ) : (
                          <div className="p-8 text-center text-slate-500 italic text-sm">
                            Nenhum CNAE carregado. Digite o CNPJ para buscar as informações.
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="integracao" className="mt-0 space-y-6">
                    <IntegracaoFiscalForm companyId={editingId} />
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>

            <DialogFooter className="p-6 pt-2 bg-slate-50">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  editingId ? "Atualizar Empresa" : "Salvar Empresa"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por CNPJ ou Razão Social..."
                className="pl-9 bg-slate-50 border-slate-200 focus:bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 items-center">
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" /> Filtros
              </Button>
              <ColumnSettings columns={orderedCols} isVisible={isVisible} toggleVisible={toggleVisible} moveColumn={moveColumn} reset={reset} pageSize={pageSize} onPageSizeChange={setPageSize} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100">
                {visibleCols.map((c) => (
                  <TableHead
                    key={c.key}
                    className={`${c.headClassName ?? ""} ${c.sortKey ? "cursor-pointer hover:text-blue-600" : ""}`}
                    onClick={c.sortKey ? () => requestSort(c.sortKey as keyof CompanyRow) : undefined}
                  >
                    <div className="flex items-center gap-1">{c.label}{c.sortKey && <ArrowUpDown className="h-3 w-3" />}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={visibleCols.length} className="text-center py-10 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" /> Carregando empresas...
                  </TableCell>
                </TableRow>
              ) : sortedCompanies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleCols.length} className="text-center py-10 text-slate-500">
                    Nenhuma empresa cadastrada. Clique em <b>Nova Empresa</b> para começar.
                  </TableCell>
                </TableRow>
              ) : (
                pagedCompanies.map((company) => (
                  <TableRow key={company.id} className="border-slate-100 hover:bg-slate-50">
                    {visibleCols.map((c) => (
                      <TableCell key={c.key} className={c.className}>{c.render(company)}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={sortedCompanies.length} onPageChange={setPage} />
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Empresa</DialogTitle>
            <DialogDescription>Informações completas do cadastro selecionado.</DialogDescription>
          </DialogHeader>
          {selectedCompany && (
            <div className="space-y-6 py-2">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Razão Social" value={selectedCompany.razao_social} />
                <Field label="Nome Fantasia" value={selectedCompany.nome_fantasia} />
                <Field label="CNPJ" value={selectedCompany.cnpj} mono />
                <Field label="UF" value={selectedCompany.uf} />
                <Field label="Inscrição Estadual" value={selectedCompany.inscricao_estadual} />
                <Field label="Inscrição Municipal" value={selectedCompany.inscricao_municipal} />
                <Field label="Responsável" value={selectedCompany.responsavel} />
                <Field label="E-mail" value={selectedCompany.email} />
                <Field label="Telefone" value={selectedCompany.telefone} />
              </div>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Endereço</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="CEP" value={selectedCompany.cep} mono />
                  <Field label="Município" value={selectedCompany.municipio} />
                  <Field
                    label="Logradouro"
                    value={
                      [selectedCompany.logradouro, selectedCompany.numero].filter(Boolean).join(", ") || null
                    }
                  />
                  <Field label="Complemento" value={selectedCompany.complemento} />
                  <Field label="Bairro" value={selectedCompany.bairro} />
                </div>
              </div>
              {selectedCompany.cnaes && selectedCompany.cnaes.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">CNAEs</h3>
                    <div className="border rounded-md divide-y overflow-hidden">
                      {selectedCompany.cnaes.map((c, i) => (
                        <div key={i} className="p-3 flex items-start gap-3 bg-white">
                          {c.main ? (
                            <Badge className="bg-blue-600 whitespace-nowrap">Principal</Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500 whitespace-nowrap">Secundário</Badge>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-mono font-medium text-slate-700">{c.code}</div>
                            <div className="text-sm text-slate-600 break-words">{c.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteCheck(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {deleteCheck?.loading ? (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Verificando movimentações...
                  </div>
                ) : deleteCheck && deleteCheck.count > 0 ? (
                  <>
                    <p className="text-red-600 font-medium">
                      Não é possível excluir esta empresa.
                    </p>
                    <p>
                      A empresa <b>{deleteTarget?.razao_social}</b> possui{" "}
                      <b>{deleteCheck.count}</b> documento(s) fiscal(is) vinculado(s).
                      Apenas empresas sem movimentação podem ser excluídas.
                    </p>
                  </>
                ) : (
                  <p>
                    Confirma a exclusão da empresa <b>{deleteTarget?.razao_social}</b>?
                    Esta ação não pode ser desfeita.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            {deleteCheck && !deleteCheck.loading && deleteCheck.count === 0 && (
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                }}
              >
                {deleteMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Excluindo...</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" /> Excluir</>
                )}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-slate-500">{label}</Label>
      <p className={`font-medium ${mono ? "font-mono" : ""}`}>{value || "-"}</p>
    </div>
  );
}
