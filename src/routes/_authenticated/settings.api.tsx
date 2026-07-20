import { createFileRoute } from "@tanstack/react-router";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key, Copy, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/settings/api")({
  component: ApiSettings,
});

function ApiSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Integração via API</h1>
        <p className="text-slate-500">Conecte o APFiscal com seu ERP ou sistema interno.</p>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">Minhas Chaves de API</CardTitle>
          <CardDescription>Use estas chaves para autenticar suas requisições.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value="ak_live_51MzS2..." readOnly className="pl-9 bg-slate-50" />
            </div>
            <Button variant="outline"><Copy className="h-4 w-4 mr-2" /> Copiar</Button>
          </div>
          <Button variant="secondary" className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Gerar Nova Chave
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
