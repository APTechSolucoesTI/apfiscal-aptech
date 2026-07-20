import { useState } from "react";
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
  Loader2
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
import { createFileRoute } from "@tanstack/react-router";
import { fetchCompanyByCnpj } from "@/lib/companies.functions";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";


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
  const [formData, setFormData] = useState({
    razao: "",
    fantasia: "",
    uf: "",
  });

  const getCompany = useServerFn(fetchCompanyByCnpj);

  const handleCnpjBlur = async () => {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) return;

    setIsLoadingCnpj(true);
    try {
      const data = await getCompany({ data: { cnpj: cleanCnpj } });
      setFormData({
        razao: data.nome,
        fantasia: data.fantasia || "",
        uf: data.uf,
      });
      toast.success("Dados da empresa carregados com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao buscar CNPJ. Verifique se o número está correto.");
    } finally {
      setIsLoadingCnpj(false);
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
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Adicionar Nova Empresa</DialogTitle>
              <DialogDescription>
                Informe o CNPJ para buscar os dados automaticamente na base da Receita/SEFAZ.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <div className="relative">
                  <Input 
                    id="cnpj" 
                    placeholder="00.000.000/0000-00" 
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    onBlur={handleCnpjBlur}
                  />
                  {isLoadingCnpj && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="razao">Razão Social</Label>
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
                <Label htmlFor="uf">UF</Label>
                <Input 
                  id="uf" 
                  placeholder="Estado (Ex: SP)" 
                  value={formData.uf}
                  onChange={(e) => setFormData({ ...formData, uf: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-600">Salvar Empresa</Button>
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