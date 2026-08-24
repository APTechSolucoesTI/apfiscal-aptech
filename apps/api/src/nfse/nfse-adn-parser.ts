import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { NfseBatch, NfseDocument } from "./nfse-provider";

type AdnEntry = {
  NSU?: number | string;
  ChaveAcesso?: string;
  TipoDocumento?: string;
  ArquivoXml?: string;
};

type AdnEnvelope = {
  StatusProcessamento?: string;
  LoteDFe?: AdnEntry[];
  Erros?: unknown;
  Alertas?: unknown;
};

function messages(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(messages);
  if (typeof value === "object")
    return Object.values(value as Record<string, unknown>).flatMap(messages);
  return [String(value)];
}

function document(entry: AdnEntry): NfseDocument | null {
  if (String(entry.TipoDocumento ?? "").toUpperCase() !== "NFSE") return null;
  const nsu = Number(entry.NSU);
  if (!Number.isSafeInteger(nsu) || nsu < 0 || !entry.ArquivoXml)
    throw new Error("A ADN retornou uma NFS-e sem NSU ou conteúdo válido.");
  let xml: Buffer;
  try {
    xml = gunzipSync(Buffer.from(entry.ArquivoXml, "base64"));
  } catch {
    throw new Error(`A ADN retornou uma NFS-e compactada inválida no NSU ${nsu}.`);
  }
  const rawDocument = xml.toString("utf8");
  if (!/<(?:\w+:)?NFSe\b/i.test(rawDocument))
    throw new Error(`O documento do NSU ${nsu} não contém uma NFS-e válida.`);
  return {
    nsu,
    accessKey:
      String(entry.ChaveAcesso ?? "").match(/^\d{50}$/)?.[0] ??
      rawDocument.match(/\b\d{50}\b/)?.[0] ??
      null,
    contentType: "application/xml",
    rawDocument,
    payloadHash: createHash("sha256").update(xml).digest("hex"),
  };
}

export function parseAdnBatch(body: Buffer, currentNsu: number): NfseBatch {
  let envelope: AdnEnvelope;
  try {
    envelope = JSON.parse(body.toString("utf8")) as AdnEnvelope;
  } catch {
    throw new Error("A ADN retornou uma resposta que não está no formato JSON esperado.");
  }
  const entries = Array.isArray(envelope.LoteDFe) ? envelope.LoteDFe : [];
  const nsus = entries
    .map((entry) => Number(entry.NSU))
    .filter((nsu) => Number.isSafeInteger(nsu) && nsu >= 0);
  const documents = entries.map(document).filter((item): item is NfseDocument => Boolean(item));
  return {
    status: String(envelope.StatusProcessamento ?? "SEM_STATUS"),
    documents,
    located: entries.length,
    lastNsu: nsus.length ? Math.max(currentNsu, ...nsus) : currentNsu,
    warnings: [...messages(envelope.Erros), ...messages(envelope.Alertas)],
  };
}
