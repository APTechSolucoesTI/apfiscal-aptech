import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ShieldCheck, 
  Upload, 
  Key,
  FileKey,
  Trash2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings/certificates")({
  component: Certificates,
});

function Certificates() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

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
                <Select>
                  <SelectTrigger id="company">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">TechBrasil LTDA</SelectItem>
                    <SelectItem value="2">Estrela Sul Alimentos</SelectItem>
                    <SelectItem value="3">LogNacional S.A.</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Senha do Certificado</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="password" type="password" className="pl-9" placeholder="Senha do arquivo" />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Arquivo do Certificado (PFX/P12)</Label>
              <div 
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors relative ${
                  selectedFile ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="file"
                  accept=".pfx,.p12"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileChange}
                />
                <div className="flex flex-col items-center">
                  <FileKey className={`h-10 w-10 mb-2 ${selectedFile ? 'text-blue-600' : 'text-slate-400'}`} />
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
              <Button className="bg-blue-600 hover:bg-blue-700 px-8" disabled={!selectedFile}>
                <Upload className="mr-2 h-4 w-4" /> Instalar Certificado
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
            <div className="divide-y divide-slate-100">
              <div className="px-6 py-4 hover:bg-slate-50 transition-colors flex justify-between items-start">
                <div className="space-y-1">
                  <p className="font-bold text-sm text-slate-900">TechBrasil LTDA</p>
                  <p className="text-xs text-slate-500">CNPJ: 12.345.678/0001-90</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0">Válido</Badge>
                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Até 20/05/2026</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="px-6 py-4 hover:bg-slate-50 transition-colors flex justify-between items-start">
                <div className="space-y-1">
                  <p className="font-bold text-sm text-slate-900">LogNacional S.A.</p>
                  <p className="text-xs text-slate-500">CNPJ: 45.678.901/0001-22</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[10px]">Atenção</Badge>
                    <span className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Expira em 15 dias</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}