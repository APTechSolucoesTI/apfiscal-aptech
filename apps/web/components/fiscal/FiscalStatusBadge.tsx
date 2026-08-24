import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock3, FileCheck2, FileSearch, Link2 } from "lucide-react";

const config: Record<string, { label: string; className: string; icon: typeof Clock3 }> = {
  processed: {
    label: "Processada",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  discovered: {
    label: "Descoberta",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    icon: FileSearch,
  },
  processing: {
    label: "Processando",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    icon: Clock3,
  },
  error: { label: "Erro", className: "border-red-200 bg-red-50 text-red-700", icon: AlertTriangle },
  cancelled: {
    label: "Cancelada",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: AlertTriangle,
  },
  replaced: {
    label: "Substituída",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Link2,
  },
  completa: {
    label: "NF-e completa",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: FileCheck2,
  },
  resumida: {
    label: "Resumo NF-e",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    icon: FileSearch,
  },
  manifestacao_pendente: {
    label: "Pendente de ciência",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Clock3,
  },
  aguardando_xml_completo: {
    label: "Aguardando XML",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    icon: Clock3,
  },
};

export function FiscalStatusBadge({
  status,
  label,
}: {
  status: string | null | undefined;
  label?: string;
}) {
  const item = config[status ?? ""] ?? {
    label: label || status || "Não informado",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    icon: Clock3,
  };
  const Icon = item.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 whitespace-nowrap font-medium ${item.className}`}>
      <Icon className="h-3 w-3" />
      {label || item.label}
    </Badge>
  );
}

export function TotvsStatusBadge({ status }: { status: string | null | undefined }) {
  const labels: Record<string, string> = {
    queued: "Na fila",
    validating: "Validando",
    blocked: "Bloqueada",
    failed: "Erro",
    completed: "Integrada",
    success: "Integrada",
  };
  const tone =
    status === "completed" || status === "success"
      ? "processed"
      : status === "failed" || status === "blocked"
        ? "error"
        : status
          ? "processing"
          : "discovered";
  return (
    <FiscalStatusBadge status={tone} label={status ? (labels[status] ?? status) : "Não iniciada"} />
  );
}
