export type NfeStatus =
  | "pendente_confirmacao"
  | "aprovada"
  | "pronta_para_integracao"
  | "integrado_totvs";

export const NFE_STATUS_ORDER: readonly NfeStatus[] = [
  "pendente_confirmacao",
  "aprovada",
  "pronta_para_integracao",
  "integrado_totvs",
];

export function nfeBloqueada(status?: string | null): boolean {
  return status === "integrado_totvs";
}

export function podeVincularProduto(status?: string | null): boolean {
  return status === "aprovada" || status === "pronta_para_integracao";
}

export function podeEditarApontamentos(status?: string | null): boolean {
  return podeVincularProduto(status);
}

export function podeAprovar(status?: string | null): boolean {
  return (status ?? "pendente_confirmacao") === "pendente_confirmacao";
}
