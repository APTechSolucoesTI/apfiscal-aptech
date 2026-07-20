import { useState, useEffect } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  ShieldCheck, 
  ShieldAlert,
  Loader2,
  MapPin,
  Building,
  Info
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
import { createFileRoute } from "@tanstack/react-router";
import { fetchCompanyByCnpj, fetchAddressByCep } from "@/lib/companies.functions";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";


export const Route = createFileRoute("/_authenticated/companies")({
  component: Companies,
});

const mockCompanies = [
  { id: "1", cnpj: "12.345.678/0001-90", razao_social: "Tecnologia e Inovação Brasil LTDA", nome_fantasia: "TechBrasil", uf: "SP", certificado: "Válido", expira_em: "2026-05-20", status: "active" },
  { id: "2", cnpj: "98.765.432/0001-10", razao_social: "Comércio de Alimentos Estrela Sul", nome_fantasia: "Estrela Sul", uf: "RS", certificado: "Expirando", expira_em: "2026-07-30", status: "warning" },
  { id: "3", cnpj: "45.678.901/0001-22", razao_social: "Logística Nacional S.A.", nome_fantasia: "LogNacional", uf: "MG", certificado: "Válido", expira_em: "2026-12-15", status: "active" }
];

function Companies() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [isLoadingCnpj, setIsLoadingCnpj] = useState(false);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  
  const [formData, setFormData] = useState({
    razao: "",
    fantasia: "",
    cnae: "",
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
  });

  const getCompany = useServerFn(fetchCompanyByCnpj);
  const getAddress = useServerFn(fetchAddressByCep);

  const handleCnpjBlur = async () => {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) return;

    setIsLoadingCnpj(true);
    try {
      const data = await getCompany({ data: { cnpj: cleanCnpj } });
      setFormData(prev => ({
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
        cnae: data.atividades_economicas?.[0]?.text || "",
        ie: data.inscricao_estadual || "",
        im: data.inscricao_municipal || "",
      }));
      toast.success("Dados da empresa carregados via CNPJ!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao buscar CNPJ. Verifique se o número está correto.");
    } finally {
      setIsLoadingCnpj(false);
    }
  };

  const handleCepBlur = async () => {
    const cleanCep = formData.cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;

    setIsLoadingCep(true);
    try {
      const data = await getAddress({ data: { cep: cleanCep } });
      setFormData(prev => ({
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empresas (CNPJs)</h1>
          <p className="text-slate-500">Gerencie as empresas e filiais da sua organização.</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> Nova Empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-600" />
                Cadastrar Nova Empresa
              </DialogTitle>
              <DialogDescription>
                Utilizamos as bases da Receita Federal e Correios para preencher os dados automaticamente.
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-1 px-6">
              <div className="grid gap-6 py-4">
                {/* Identificação Básica */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Building className="h-4 w-4 text-blue-600" />
                    Identificação
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="cnpj">CNPJ <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        <Input 
                          id="cnpj" 
                          placeholder="00.000.000/0000-00" 
                          value={cnpj}
                          onChange={(e) => setCnpj(e.target.value)}
                          onBlur={handleCnpjBlur}
                          className="font-mono"
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
                      <Input 
                        id="razao" 
                        placeholder="Razão Social completa" 
                        value={formData.razao}
                        onChange={(e) => setFormData({ ...formData, razao: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="fantasia">Nome Fantasia</Label>
                      <Input 
                        id="fantasia" 
                        placeholder="Nome Fantasia" 
                        value={formData.fantasia}
                        onChange={(e) => setFormData({ ...formData, fantasia: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cnae">CNAE Principal</Label>
                      <Input 
                        id="cnae" 
                        placeholder="Ex: 6201-5/01" 
                        value={formData.cnae}
                        onChange={(e) => setFormData({ ...formData, cnae: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-100" />

                {/* Inscrições Fiscais */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Info className="h-4 w-4 text-blue-600" />
                    Dados Fiscais
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="ie">Inscrição Estadual</Label>
                      <Input 
                        id="ie" 
                        placeholder="IE" 
                        value={formData.ie}
                        onChange={(e) => setFormData({ ...formData, ie: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="im">Inscrição Municipal</Label>
                      <Input 
                        id="im" 
                        placeholder="IM" 
                        value={formData.im}
                        onChange={(e) => setFormData({ ...formData, im: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-100" />

                {/* Endereço */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    Localização
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="cep">CEP <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        <Input 
                          id="cep" 
                          placeholder="00000-000" 
                          value={formData.cep}
                          onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                          onBlur={handleCepBlur}
                          className="font-mono"
                        />
                        {isLoadingCep && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="logradouro">Logradouro <span className="text-red-500">*</span></Label>
                      <Input 
                        id="logradouro" 
                        placeholder="Rua, Av, etc" 
                        value={formData.logradouro}
                        onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="numero">Número <span className="text-red-500">*</span></Label>
                      <Input 
                        id="numero" 
                        placeholder="Ex: 123" 
                        value={formData.numero}
                        onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="complemento">Complemento</Label>
                      <Input 
                        id="complemento" 
                        placeholder="Apto, Sala, etc" 
                        value={formData.complemento}
                        onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="bairro">Bairro <span className="text-red-500">*</span></Label>
                      <Input 
                        id="bairro" 
                        placeholder="Bairro" 
                        value={formData.bairro}
                        onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="municipio">Cidade <span className="text-red-500">*</span></Label>
                      <Input 
                        id="municipio" 
                        placeholder="Cidade" 
                        value={formData.municipio}
                        onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="uf">UF <span className="text-red-500">*</span></Label>
                      <Input 
                        id="uf" 
                        placeholder="SP" 
                        value={formData.uf}
                        maxLength={2}
                        onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="p-6 pt-2 bg-slate-50">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                Salvar Empresa
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
              <Input placeholder="Buscar por CNPJ ou Razão Social..." className="pl-9 bg-slate-50 border-slate-200 focus:bg-white" />
            </div>
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" /> Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="text-slate-500 font-semibold">Empresa</TableHead>
                <TableHead className="text-slate-500 font-semibold">CNPJ</TableHead>
                <TableHead className="text-slate-500 font-semibold">UF</TableHead>
                <TableHead className="text-slate-500 font-semibold">Certificado Digital</TableHead>
                <TableHead className="text-slate-500 font-semibold">Expiração</TableHead>
                <TableHead className="text-right text-slate-500 font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCompanies.map((company) => (
                <TableRow key={company.id} className="border-slate-100 hover:bg-slate-50 transition-colors">
                  <TableCell>
                    <div>
                      <div className="font-medium text-slate-900">{company.nome_fantasia || company.razao_social}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[200px]">{company.razao_social}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs">{company.cnpj}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-semibold text-slate-600 border-slate-200">
                      {company.uf}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {company.status === 'active' ? (
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                      ) : (
                        <ShieldAlert className="h-4 w-4 text-amber-500" />
                      )}
                      <span className={`text-sm font-medium ${company.status === 'active' ? 'text-green-700' : 'text-amber-700'}`}>
                        {company.certificado}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">
                    {new Date(company.expira_em).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}