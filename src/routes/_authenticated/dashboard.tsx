import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type DocRow = {
  tipo: "nfe" | "nfse" | "cte";
  valor_total: number | null;
  data_emissao: string | null;
  status_manifestacao: string | null;
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function Dashboard() {
  const [companyId, setCompanyId] = useState<string>("all");

  const { data: companies } = useQuery({
    queryKey: ["dashboard", "companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, razao_social, nome_fantasia")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "summary", companyId],
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 5);
      since.setDate(1);
      let docsQuery = supabase
        .from("fiscal_documents")
        .select("tipo, valor_total, data_emissao, status_manifestacao")
        .gte("data_emissao", since.toISOString());
      if (companyId !== "all") docsQuery = docsQuery.eq("company_id", companyId);
      const [docsRes, companiesRes] = await Promise.all([
        docsQuery,
        supabase.from("companies").select("id", { count: "exact", head: true }),
      ]);
      if (docsRes.error) throw docsRes.error;
      if (companiesRes.error) throw companiesRes.error;
      const docs = (docsRes.data ?? []) as DocRow[];
      const total = docs.length;
      const totalValue = docs.reduce((s, d) => s + Number(d.valor_total ?? 0), 0);
      const pending = docs.filter((d) => {
        const s = (d.status_manifestacao ?? "").toLowerCase();
        return !s || s.includes("pend");
      }).length;
      const compliance = total > 0 ? ((total - pending) / total) * 100 : 100;

      // Group by month
      const buckets: Record<string, { name: string; nfe: number; nfse: number; cte: number }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        buckets[key] = { name: MONTHS[d.getMonth()], nfe: 0, nfse: 0, cte: 0 };
      }
      for (const d of docs) {
        if (!d.data_emissao) continue;
        const dt = new Date(d.data_emissao);
        const key = `${dt.getFullYear()}-${dt.getMonth()}`;
        if (buckets[key]) buckets[key][d.tipo] += 1;
      }
      return {
        total,
        totalValue,
        pending,
        compliance,
        companies: companiesRes.count ?? 0,
        chartData: Object.values(buckets),
      };
    },
  });

  const stats = [
    { title: "Documentos (últimos 6 meses)", value: (data?.total ?? 0).toLocaleString("pt-BR"), icon: FileText, description: "NF-e, NFS-e e CT-e" },
    { title: "Valor Total", value: (data?.totalValue ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), icon: TrendingUp, description: "Volume financeiro" },
    { title: "Pendentes de Manifesto", value: String(data?.pending ?? 0), icon: AlertTriangle, description: "Ações necessárias" },
    { title: "Compliance Fiscal", value: `${(data?.compliance ?? 100).toFixed(1)}%`, icon: CheckCircle2, description: "Notas manifestadas" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Geral</h1>
          <p className="text-slate-500">Bem-vindo ao APFiscal. Veja o resumo de suas operações.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="w-[260px] bg-white">
              <SelectValue placeholder="Filtrar por empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {(companies ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome_fantasia || c.razao_social}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md shadow-sm">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {isLoading ? "..." : `${data?.companies ?? 0} empresa(s)`}
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <Card key={stat.title} className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">{stat.title}</CardTitle>
                  <stat.icon className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                  <p className="text-[10px] text-slate-400 mt-1">{stat.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Volume de Documentos</CardTitle>
              <CardDescription>Comparativo mensal por tipo de documento</CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              {(data?.total ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-500">
                  Sem documentos no período. Capture NF-e via certificado A1 para popular o gráfico.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.chartData ?? []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="nfe" name="NF-e" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="nfse" name="NFS-e" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cte" name="CT-e" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
