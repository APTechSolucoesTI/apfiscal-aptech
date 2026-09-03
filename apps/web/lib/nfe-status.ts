export type NfeStatus =
  | "pendente_confirmacao"
  | "aprovada"
  | "pronta_para_integracao"
  | "integrado_totvs"
  | "ja_existente_totvs";

export const NFE_STATUS_CONFIG: Record<NfeStatus, { label: string; badge: string; dot: string }> = {
  pendente_confirmacao: {
    label: "Pendente de Confirmação",
    badge: "bg-red-100 text-red-700 hover:bg-red-100 border-red-200",
    dot: "bg-red-500",
  },
  aprovada: {
    label: "NF-e Aprovada",
    badge: "bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200",
    dot: "bg-orange-500",
  },
  pronta_para_integracao: {
    label: "Pronto para Integração",
    badge: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-200",
    dot: "bg-yellow-500",
  },
  integrado_totvs: {
    label: "Integrado na TOTVS",
    badge: "bg-green-100 text-green-700 hover:bg-green-100 border-green-200",
    dot: "bg-green-500",
  },
  ja_existente_totvs: {
    label: "Já existente no TOTVS",
    badge: "bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-300",
    dot: "bg-slate-500",
  },
};

export const NFE_STATUS_ORDER: NfeStatus[] = [
  "pendente_confirmacao",
  "aprovada",
  "pronta_para_integracao",
  "integrado_totvs",
  "ja_existente_totvs",
];

export function statusConfig(status?: string | null, documentType: "NF-e" | "NFS-e" = "NF-e") {
  const item =
    NFE_STATUS_CONFIG[(status ?? "pendente_confirmacao") as NfeStatus] ??
    NFE_STATUS_CONFIG.pendente_confirmacao;
  return documentType === "NFS-e" && item.label === "NF-e Aprovada"
    ? { ...item, label: "NFS-e Aprovada" }
    : item;
}

/** Apontamentos (Plano de Contas / Local de Estoque / Centro de Custo) editáveis? */
export function podeEditarApontamentos(status?: string | null) {
  return status === "aprovada" || status === "pronta_para_integracao";
}

export function podeAprovar(status?: string | null) {
  return (status ?? "pendente_confirmacao") === "pendente_confirmacao";
}

/** NF-e integrada na TOTVS: totalmente bloqueada para alterações */
export function nfeBloqueada(status?: string | null) {
  return status === "integrado_totvs" || status === "ja_existente_totvs";
}

/** Vínculos de produto/fornecedor podem ser revisados mesmo após a integração no RM. */
export function podeVincularProduto(status?: string | null) {
  return (
    status === "aprovada" || status === "pronta_para_integracao" || status === "integrado_totvs"
  );
}

export function motivoBloqueioVinculo(_status?: string | null) {
  if (_status === "ja_existente_totvs")
    return "Esta NF-e já existia no TOTVS e está disponível somente para visualização.";
  return "Esta NF-e está pendente de confirmação. Aprove a NF-e antes de vincular produtos aos itens.";
}
