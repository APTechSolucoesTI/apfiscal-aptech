import { createFileRoute } from "@tanstack/react-router";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { 
  FileText, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2,
  Building2,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area 
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const mockStats = [
  {
    title: "Notas Capturadas (Mês)",
    value: "1,284",
    icon: FileText,
    trend: "+12.5%",
    trendUp: true,
    description: "NF-e, NFS-e e CT-e"
  },
  {
    title: "Valor Total",
    value: "R$ 452.890,00",
    icon: TrendingUp,
    trend: "+8.2%",
    trendUp: true,
    description: "Volume financeiro capturado"
  },
  {
    title: "Pendentes de Manifesto",
    value: "42",
    icon: AlertTriangle,
    trend: "-5",
    trendUp: false,
    description: "Ações necessárias"
  },
  {
    title: "Compliance Fiscal",
    value: "98.2%",
    icon: CheckCircle2,
    trend: "+0.5%",
    trendUp: true,
    description: "Notas no prazo legal"
  }
];

const chartData = [
  { name: "Jan", nfe: 400, nfse: 240, cte: 100 },
  { name: "Fev", nfe: 300, nfse: 139, cte: 150 },
  { name: "Mar", nfe: 200, nfse: 980, cte: 120 },
  { name: "Abr", nfe: 278, nfse: 390, cte: 180 },
  { name: "Mai", nfe: 189, nfse: 480, cte: 210 },
  { name: "Jun", nfe: 239, nfse: 380, cte: 190 },
];

function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Geral</h1>
          <p className="text-slate-500">Bem-vindo ao APFiscal. Veja o resumo de suas operações.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md shadow-sm">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Todas as Empresas</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockStats.map((stat) => (
          <Card key={stat.title} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="flex items-center mt-1">
                {stat.trendUp ? (
                  <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-red-500 mr-1" />
                )}
                <span className={`text-xs font-medium ${stat.trendUp ? "text-green-600" : "text-red-600"}`}>
                  {stat.trend}
                </span>
                <span className="text-[10px] text-slate-400 ml-1.5">{stat.description}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Volume de Documentos</CardTitle>
            <CardDescription>Comparativo mensal por tipo de documento</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="nfe" name="NF-e" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="nfse" name="NFS-e" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cte" name="CT-e" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Últimas Manifestações</CardTitle>
            <CardDescription>Ações recentes dos usuários</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-start gap-3 pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                  <div className={`mt-1 h-2 w-2 rounded-full ${i % 2 === 0 ? 'bg-green-500' : 'bg-amber-500'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {i % 2 === 0 ? 'Confirmação da Operação' : 'Ciência da Emissão'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">NF-e: 3522...9001 - Empresa ABC</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-slate-400">Há {i * 15} min</span>
                      <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Admin</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
