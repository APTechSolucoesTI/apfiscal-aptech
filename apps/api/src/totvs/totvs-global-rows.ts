export function sourceColigada(row: Record<string, unknown>): number | null {
  const value = Number(row.coligada ?? row.codcoligada);
  return Number.isFinite(value) ? value : null;
}

/**
 * Combines RM global records (coligada 0) with one company's records.
 * Company-specific rows are applied last and override a global row with the same business key.
 */
export function mergeGlobalRows(
  rows: Record<string, unknown>[],
  coligadaId: number,
  businessKey: (row: Record<string, unknown>) => string,
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();

  for (const sourceId of [0, coligadaId]) {
    for (const row of rows) {
      if (sourceColigada(row) !== sourceId) continue;
      const key = businessKey(row).trim();
      if (key) merged.set(key, row);
    }
  }

  return [...merged.values()];
}
