export type TotvsStructureMode = "COLIGADA" | "FILIAL";

export type TotvsOrganizationConfig = {
  mode: TotvsStructureMode;
  mainColigadaId: number | null;
};

export type TotvsCompanyConfig = {
  id: string;
  organizationId: string;
  connectionKey: string | null;
  coligadaId: number | null;
  filialId: number | null;
};

export type TotvsCompanyScope = {
  mode: TotvsStructureMode;
  companyId: string;
  organizationId: string;
  connectionKey: string;
  codColigada: number;
  codFilial: number | null;
};

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveTotvsCompanyScopes(
  organization: TotvsOrganizationConfig,
  companies: TotvsCompanyConfig[],
  defaultConnectionKey: string,
): TotvsCompanyScope[] {
  return companies.flatMap((company): TotvsCompanyScope[] => {
    const connectionKey = company.connectionKey ?? defaultConnectionKey;
    if (organization.mode === "FILIAL") {
      const codColigada = positiveInteger(organization.mainColigadaId);
      const codFilial = positiveInteger(company.filialId);
      if (!codColigada || !codFilial || !company.connectionKey) return [];
      return [{
        mode: organization.mode,
        companyId: company.id,
        organizationId: company.organizationId,
        connectionKey,
        codColigada,
        codFilial,
      }];
    }

    const codColigada = positiveInteger(company.coligadaId);
    if (!codColigada) return [];
    return [{
      mode: organization.mode,
      companyId: company.id,
      organizationId: company.organizationId,
      connectionKey,
      codColigada,
      codFilial: null,
    }];
  });
}

export function sourceColigada(row: Record<string, unknown>): number | null {
  const value = Number(row.coligada ?? row.codcoligada);
  return Number.isFinite(value) ? value : null;
}

export function sourceFilial(row: Record<string, unknown>): number | null {
  const raw = row.filial ?? row.codfilial;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Resolve linhas globais, de coligada e de filial para uma empresa.
 * Precedência: coligada 0, coligada principal sem filial, filial específica.
 */
export function rowsForTotvsScope(
  rows: Record<string, unknown>[],
  scope: TotvsCompanyScope,
  businessKey: (row: Record<string, unknown>) => string,
  filialAware: boolean,
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  const apply = (predicate: (row: Record<string, unknown>) => boolean) => {
    for (const row of rows) {
      if (!predicate(row)) continue;
      const key = businessKey(row).trim();
      if (key) merged.set(key, row);
    }
  };

  apply((row) => sourceColigada(row) === 0);
  if (scope.mode === "COLIGADA" || !filialAware) {
    apply((row) => sourceColigada(row) === scope.codColigada);
    return [...merged.values()];
  }

  apply(
    (row) => sourceColigada(row) === scope.codColigada && sourceFilial(row) === null,
  );
  apply(
    (row) =>
      sourceColigada(row) === scope.codColigada && sourceFilial(row) === scope.codFilial,
  );
  return [...merged.values()];
}

export function sourceColigadasForScopes(scopes: TotvsCompanyScope[]): number[] {
  return [...new Set([0, ...scopes.map((scope) => scope.codColigada)])];
}
