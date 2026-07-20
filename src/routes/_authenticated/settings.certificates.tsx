import { createFileRoute } from "@tanstack/react-router";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  ShieldCheck, 
  Upload, 
  AlertTriangle 
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/certificates")({
  component: Certificates,
});

function Certificates() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Certificados Digitais</h1>
        <p className="text-slate-500">Gerencie os certificados A1 para manifestação automática.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Upload de Certificado</CardTitle>
            <CardDescription>Envie o arquivo .pfx ou .p12 do seu certificado A1.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-10 text-center hover:bg-slate-50 transition-colors cursor-pointer">
              <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600">Arraste e solte o arquivo aqui ou clique para buscar</p>
            </div>
            <Button className="w-full bg-blue-600">Configurar Senha e Salvar</Button>
          </CardContent>
        </Card>

        <Card className="border-blue-50 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Certificados Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-3 bg-white rounded border border-blue-100 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm text-slate-900">TechBrasil LTDA</p>
                  <p className="text-xs text-slate-500">Expira em 20/05/2026</p>
                </div>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Válido</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
