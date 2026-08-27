"use client";

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
  ClipboardCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
import { NFE_STATUS_ORDER, statusConfig, type NfeStatus } from "@/lib/nfe-status";

type DocRow = {
  valor_total: number | null;
  data_emissao: string | null;
  status: NfeStatus | null;
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const STATUS_COLORS: Record<NfeStatus, string> = {
  pendente_confirmacao: "#ef4444",
  aprovada: "#f97316",
  pronta_para_integracao: "#eab308",
  integrado_totvs: "#22c55e",
  ja_existente_totvs: "#64748b",
};

const STATUS_ICONS: Record<NfeStatus, typeof FileText> = {
  pendente_confirmacao: AlertTriangle,
  aprovada: ClipboardCheck,
  pronta_para_integracao: TrendingUp,
  integrado_totvs: CheckCircle2,
  ja_existente_totvs: CheckCircle2,
};

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
    queryKey: ["dashboard", "status-summary", companyId],
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 5);
      since.setDate(1);
      let docsQuery = supabase
        .from("fiscal_documents")
        .select("valor_total, data_emissao, status")
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

      const byStatus = {} as Record<NfeStatus, { count: number; valor: number }>;
      for (const st of NFE_STATUS_ORDER) byStatus[st] = { count: 0, valor: 0 };
      for (const d of docs) {
        const st = (d.status ?? "pendente_confirmacao") as NfeStatus;
        if (!byStatus[st]) continue;
        byStatus[st].count += 1;
        byStatus[st].valor += Number(d.valor_total ?? 0);
      }

      // Group by month, stacked by status
      const buckets: Record<string, Record<string, number | string>> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        buckets[key] = {
          name: MONTHS[d.getMonth()],
          pendente_confirmacao: 0,
          aprovada: 0,
          pronta_para_integracao: 0,
          integrado_totvs: 0,
        };
      }
      for (const d of docs) {
        if (!d.data_emissao) continue;
        const dt = new Date(d.data_emissao);
        const key = `${dt.getFullYear()}-${dt.getMonth()}`;
        const st = (d.status ?? "pendente_confirmacao") as NfeStatus;
        if (buckets[key] && typeof buckets[key][st] === "number") {
          buckets[key][st] = (buckets[key][st] as number) + 1;
        }
      }
      return {
        total,
        totalValue,
        byStatus,
        companies: companiesRes.count ?? 0,
        chartData: Object.values(buckets),
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Geral</h1>
          <p className="text-slate-500">Situação das NF-e por status de aprovação (últimos 6 meses).</p>
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
                  {c.razao_social}{c.nome_fantasia ? ` (${c.nome_fantasia})` : ""}
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
            {NFE_STATUS_ORDER.map((st) => {
              const cfg = statusConfig(st);
              const Icon = STATUS_ICONS[st];
              const info = data?.byStatus?.[st] ?? { count: 0, valor: 0 };
              const pct = data && data.total > 0 ? (info.count / data.total) * 100 : 0;
              return (
                <Card key={st} className="border-slate-200 shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">{cfg.label}</CardTitle>
                    <Icon className="h-4 w-4" style={{ color: STATUS_COLORS[st] }} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-slate-900">{info.count.toLocaleString("pt-BR")}</div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {info.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {pct.toFixed(1)}% do total
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">NF-e no período</CardTitle>
                <FileText className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{(data?.total ?? 0).toLocaleString("pt-BR")}</div>
                <p className="text-[10px] text-slate-400 mt-1">Documentos fiscais nos últimos 6 meses</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Valor Total</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {(data?.totalValue ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Volume financeiro no período</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Volume de NF-e por Status</CardTitle>
              <CardDescription>Comparativo mensal conforme o status de aprovação</CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              {(data?.total ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-500">
                  Sem documentos no período. Importe ou sincronize NF-e para popular o gráfico.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.chartData ?? []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} cursor={{ fill: "#f8fafc" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {NFE_STATUS_ORDER.map((st) => (
                      <Bar
                        key={st}
                        dataKey={st}
                        stackId="status"
                        name={statusConfig(st).label}
                        fill={STATUS_COLORS[st]}
                        radius={st === "integrado_totvs" ? [4, 4, 0, 0] : undefined}
                      />
                    ))}
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

export default Dashboard;
