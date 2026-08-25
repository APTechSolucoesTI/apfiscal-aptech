export type ManifestationKind =
  | "ciencia"
  | "confirmacao"
  | "desconhecimento"
  | "nao_realizada";

export type ManifestationState =
  | "pending"
  | "science"
  | "confirmed"
  | "unknown"
  | "not_performed"
  | "error";

export type NfeLifecycleState =
  | "summary_pending"
  | "waiting_full_xml"
  | "full"
  | "cancelled"
  | "error";

export const MANIFESTATION_EVENT = {
  ciencia: { code: "210210", description: "Ciência da Emissão", conclusive: false },
  confirmacao: { code: "210200", description: "Confirmação da Operação", conclusive: true },
  desconhecimento: { code: "210220", description: "Desconhecimento da Operação", conclusive: true },
  nao_realizada: { code: "210240", description: "Operação Não Realizada", conclusive: true },
} as const satisfies Record<
  ManifestationKind,
  { code: string; description: string; conclusive: boolean }
>;

export const ACCEPTED_MANIFESTATION_CSTATS = new Set(["135", "136", "573"]);

export function manifestationAccepted(cStat?: string | null): boolean {
  return Boolean(cStat && ACCEPTED_MANIFESTATION_CSTATS.has(cStat));
}

export function manifestationState(
  acceptedEvents: readonly ManifestationKind[],
  hasError = false,
): ManifestationState {
  if (hasError) return "error";
  if (acceptedEvents.includes("nao_realizada")) return "not_performed";
  if (acceptedEvents.includes("desconhecimento")) return "unknown";
  if (acceptedEvents.includes("confirmacao")) return "confirmed";
  if (acceptedEvents.includes("ciencia")) return "science";
  return "pending";
}

export function deriveNfeLifecycle(input: {
  hasFullXml: boolean;
  situation?: string | null;
  acceptedEvents?: readonly ManifestationKind[];
  hasError?: boolean;
}) {
  const manifestation = manifestationState(input.acceptedEvents ?? [], input.hasError);
  const cancelled = ["101", "110", "135_cancelled"].includes(input.situation ?? "");
  const document: NfeLifecycleState = cancelled
    ? "cancelled"
    : input.hasFullXml
      ? "full"
      : input.hasError
        ? "error"
        : manifestation === "science" || manifestation === "confirmed"
          ? "waiting_full_xml"
          : "summary_pending";

  return {
    document,
    manifestation,
    // A Central de Resumidas nunca recebe uma NF-e cujo XML completo já chegou.
    visibleInSummaryCenter: !input.hasFullXml,
    requiresManifestation:
      !input.hasFullXml && !["confirmed", "unknown", "not_performed"].includes(manifestation),
    waitingForFullXml:
      !input.hasFullXml && (manifestation === "science" || manifestation === "confirmed"),
  };
}

