import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Upload, Key, FileKey, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { installCertificate } from "@/lib/certificates.functions";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const Route = createFileRoute("/_authenticated/settings/certificates")({
  component: Certificates,
});

type CertRow = {
  id: string;
  company_id: string;
  type: string | null;
  file_path: string | null;
  expires_at: string | null;
  status: string | null;
  created_at: string;
};

type CompanyRef = { id: string; razao_social: string; cnpj: string };

function Certificates() {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [companyId, setCompanyId] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const { data: companies = [] } = useQuery({
    queryKey: ["companies", "ref"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, razao_social, cnpj").order("razao_social");
      if (error) throw error;
      return (data ?? []) as CompanyRef[];
    },
  });

  const { data: certs = [], isLoading } = useQuery({
    queryKey: ["digital_certificates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_certificates")
        .select("id, company_id, type, file_path, expires_at, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CertRow[];
    },
  });

  const companyMap = new Map(companies.map((c) => [c.id, c]));

  const installFn = useServerFn(installCertificate);

  const installMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Selecione a empresa.");
      if (!selectedFile) throw new Error("Selecione o arquivo do certificado.");
      if (!password) throw new Error("Informe a senha do certificado.");
      const fileBase64 = await fileToBase64(selectedFile);
      return installFn({
        data: {
          companyId,
          fileName: selectedFile.name,
          fileBase64,
          password,
        },
      });
    },
    onSuccess: (res) => {
      const validade = res?.expiresAt
        ? new Date(res.expiresAt).toLocaleDateString("pt-BR")
        : "";
      toast.success(`Certificado válido instalado.${validade ? ` Validade: ${validade}` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["digital_certificates"] });
      setSelectedFile(null);
      setPassword("");
      setCompanyId("");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro ao registrar certificado."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("digital_certificates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificado removido.");
      queryClient.invalidateQueries({ queryKey: ["digital_certificates"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Erro ao remover."),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Certificados Digitais</h1>
        <p className="text-slate-500">Gerencie os certificados A1 para manifestação automática.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Upload de Certificado</CardTitle>
            <CardDescription>Envie o arquivo .pfx ou .p12 do seu certificado A1 para habilitar o monitoramento automático.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="company">Empresa correspondente</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger id="company">
                    <SelectValue placeholder={companies.length ? "Selecione a empresa" : "Cadastre uma empresa primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Senha do Certificado</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    className="pl-9"
                    placeholder="Senha do arquivo"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Arquivo do Certificado (PFX/P12)</Label>
              <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors relative ${selectedFile ? "border-blue-400 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"}`}>
                <input
                  type="file"
                  accept=".pfx,.p12"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-col items-center">
                  <FileKey className={`h-10 w-10 mb-2 ${selectedFile ? "text-blue-600" : "text-slate-400"}`} />
                  {selectedFile ? (
                    <div>
                      <p className="text-sm font-medium text-slate-900">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-slate-600 font-medium">Clique para selecionar ou arraste o arquivo</p>
                      <p className="text-xs text-slate-500 mt-1">Apenas arquivos .pfx ou .p12 (Modelo A1)</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                className="bg-blue-600 hover:bg-blue-700 px-8"
                disabled={!selectedFile || !companyId || installMutation.isPending}
                onClick={() => installMutation.mutate()}
              >
                {installMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Instalar Certificado
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Certificados Ativos
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : certs.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500 px-6">Nenhum certificado instalado.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {certs.map((c) => {
                  const co = companyMap.get(c.company_id);
                  const daysLeft = c.expires_at ? Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 86400000) : null;
                  const isWarning = daysLeft !== null && daysLeft < 30 && daysLeft >= 0;
                  const isExpired = daysLeft !== null && daysLeft < 0;
                  return (
                    <div key={c.id} className="px-6 py-4 hover:bg-slate-50 flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="font-bold text-sm text-slate-900">{co?.razao_social ?? "Empresa"}</p>
                        <p className="text-xs text-slate-500">CNPJ: {co?.cnpj ?? "-"}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge className={
                            isExpired ? "bg-red-100 text-red-700 hover:bg-red-100 border-0"
                            : isWarning ? "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0"
                            : "bg-green-100 text-green-700 hover:bg-green-100 border-0"
                          }>
                            {isExpired ? "Expirado" : isWarning ? "Atenção" : "Válido"}
                          </Badge>
                          {c.expires_at && (
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                              Até {new Date(c.expires_at).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-500"
                        onClick={() => deleteMutation.mutate(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
