import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/risk")({
  component: RiskManagement,
});

function RiskManagement() {
  const { data, isLoading } = useQuery({
    queryKey: ["risk", "summary"],
    queryFn: async () => {
      const [pendingRes, riskRes, expiringCertsRes] = await Promise.all([
        supabase
          .from("fiscal_documents")
          .select("id", { count: "exact", head: true })
          .or("status_manifestacao.is.null,status_manifestacao.ilike.pend%"),
        supabase
          .from("fiscal_documents")
          .select("id", { count: "exact", head: true })
          .eq("risk_flag", true),
        supabase
          .from("digital_certificates")
          .select("id, expires_at"),
      ]);
      if (pendingRes.error) throw pendingRes.error;
      if (riskRes.error) throw riskRes.error;
      if (expiringCertsRes.error) throw expiringCertsRes.error;
      const now = Date.now();
      const expiring = (expiringCertsRes.data ?? []).filter((c) => {
        if (!c.expires_at) return false;
        const days = (new Date(c.expires_at).getTime() - now) / 86400000;
        return days < 30;
      }).length;
      return {
        pending: pendingRes.count ?? 0,
        risk: riskRes.count ?? 0,
        expiring,
      };
    },
  });

  const risks = [
    {
      title: "Notas sem Manifestação",
      count: data?.pending ?? 0,
      level: (data?.pending ?? 0) > 0 ? "high" : "low",
      description: "Documentos que precisam de ação para evitar multas.",
    },
    {
      title: "Documentos com Risco Fiscal",
      count: data?.risk ?? 0,
      level: (data?.risk ?? 0) > 0 ? "medium" : "low",
      description: "Notas sinalizadas com indicadores de irregularidade.",
    },
    {
      title: "Certificados a Vencer",
      count: data?.expiring ?? 0,
      level: (data?.expiring ?? 0) > 0 ? "medium" : "low",
      description: "Certificados A1 com vencimento em menos de 30 dias.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Gestão de Risco</h1>
        <p className="text-slate-500">Identifique e mitigue problemas fiscais preventivamente.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {risks.map((risk, i) => {
            const isLow = risk.level === "low";
            const borderColor =
              risk.level === "high" ? "border-l-red-500" : risk.level === "medium" ? "border-l-amber-500" : "border-l-green-500";
            const bg =
              risk.level === "high" ? "bg-red-50 text-red-600"
              : risk.level === "medium" ? "bg-amber-50 text-amber-600"
              : "bg-green-50 text-green-600";
            const Icon = risk.level === "high" ? ShieldAlert : risk.level === "medium" ? AlertTriangle : CheckCircle;
            return (
              <Card key={i} className={`border-l-4 ${borderColor}`}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-bold">{risk.title}</CardTitle>
                    <div className={`p-2 rounded-lg ${bg}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold mb-1">{risk.count}</div>
                  <p className="text-sm text-slate-500">
                    {isLow ? "Nenhuma ocorrência no momento." : risk.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
