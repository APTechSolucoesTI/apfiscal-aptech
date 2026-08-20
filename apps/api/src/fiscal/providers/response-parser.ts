import { unzipSync } from "node:zlib";
import type { DistributionResult } from "@apfiscal/shared";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function scalar(root: unknown, names: readonly string[]): string | undefined {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const visit = (value: unknown): string | undefined => {
    const record = object(value);
    if (!record) return undefined;
    for (const [key, item] of Object.entries(record)) {
      if (wanted.has(key.replace(/^@_/, "").toLowerCase()) && ["string", "number"].includes(typeof item)) return String(item);
    }
    for (const item of Object.values(record)) {
      const found = Array.isArray(item) ? item.map(visit).find(Boolean) : visit(item);
      if (found) return found;
    }
    return undefined;
  };
  return visit(root);
}

function decodeXml(value: string): string {
  if (value.trimStart().startsWith("<")) return value;
  try {
    const compressed = Buffer.from(value.replace(/\s/g, ""), "base64");
    return unzipSync(compressed).toString("utf8");
  } catch {
    return value;
  }
}

function collectDocuments(root: unknown): DistributionResult["documents"] {
  const documents: DistributionResult["documents"] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    const record = object(value);
    if (!record) return;
    for (const [key, item] of Object.entries(record)) {
      if (key.toLowerCase().includes("doczip")) {
        const entries = Array.isArray(item) ? item : [item];
        for (const entry of entries) {
          const doc = object(entry);
          const encoded = typeof entry === "string" ? entry : String(doc?.["#text"] ?? doc?._ ?? doc?.value ?? "");
          if (!encoded) continue;
          documents.push({
            nsu: String(doc?.["@_NSU"] ?? doc?.NSU ?? doc?.nsu ?? "0"),
            schema: String(doc?.["@_schema"] ?? doc?.schema ?? "unknown"),
            xml: decodeXml(encoded),
          });
        }
      } else visit(item);
    }
  };
  visit(root);
  return documents;
}

export function parseDistributionResponse(response: unknown, currentNsu: string): DistributionResult {
  return {
    cStat: scalar(response, ["cStat"]) ?? "999",
    xMotivo: scalar(response, ["xMotivo"]) ?? "Resposta da SEFAZ sem motivo informado.",
    lastNsu: scalar(response, ["ultNSU"]) ?? currentNsu,
    maxNsu: scalar(response, ["maxNSU"]),
    documents: collectDocuments(response),
  };
}

export function parseEventResponse(response: unknown): { cStat: string; xMotivo: string } {
  return {
    cStat: scalar(response, ["cStat"]) ?? "999",
    xMotivo: scalar(response, ["xMotivo"]) ?? "Resposta da SEFAZ sem motivo informado.",
  };
}
