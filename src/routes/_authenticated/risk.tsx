import { createFileRoute } from "@tanstack/react-router";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
} from "@/components/ui/card";
import { ShieldAlert, AlertTriangle, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/risk")({
  component: RiskManagement,
});

function RiskManagement() {
  const risks = [
    {
      title: "Notas sem Manifestação",
      count: 14,
      level: "high",
      description: "Documentos que precisam de ação imediata para evitar multas."
    },
    {
      title: "Fornecedores Suspensos",
      count: 2,
      level: "medium",
      description: "CNPJs que emitiram notas mas estão com irregularidades no Sintegra."
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Gestão de Risco</h1>
        <p className="text-slate-500">Identifique e mitigue problemas fiscais preventivamente.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {risks.map((risk, i) => (
          <Card key={i} className={`border-l-4 ${risk.level === 'high' ? 'border-l-red-500' : 'border-l-amber-500'}`}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg font-bold">{risk.title}</CardTitle>
                <div className={`p-2 rounded-lg ${risk.level === 'high' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                  {risk.level === 'high' ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-1">{risk.count}</div>
              <p className="text-sm text-slate-500">{risk.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
