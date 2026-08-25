import { describe, expect, it } from "vitest";
import {
  resolveTotvsCompanyScopes,
  rowsForTotvsScope,
  sourceColigadasForScopes,
  type TotvsCompanyConfig,
} from "./totvs-scope";

const companies: TotvsCompanyConfig[] = [
  {
    id: "santa",
    organizationId: "granja",
    connectionKey: "TOTVS_GRANJA",
    coligadaId: null,
    filialId: 1,
  },
  {
    id: "jacutinga",
    organizationId: "granja",
    connectionKey: "TOTVS_GRANJA",
    coligadaId: null,
    filialId: 2,
  },
];

describe("TOTVS scope resolution", () => {
  it("preserves one coligada per company in COLIGADA mode", () => {
    const scopes = resolveTotvsCompanyScopes(
      { mode: "COLIGADA", mainColigadaId: null },
      [
        { ...companies[0], coligadaId: 1, filialId: null },
        { ...companies[1], coligadaId: 2, filialId: null },
      ],
      "DEFAULT",
    );
    expect(scopes.map((scope) => [scope.companyId, scope.codColigada, scope.codFilial])).toEqual([
      ["santa", 1, null],
      ["jacutinga", 2, null],
    ]);
    expect(sourceColigadasForScopes(scopes)).toEqual([0, 1, 2]);
  });

  it("uses shared coligada and distinct branches in FILIAL mode", () => {
    const scopes = resolveTotvsCompanyScopes(
      { mode: "FILIAL", mainColigadaId: 2 },
      companies,
      "DEFAULT",
    );
    expect(scopes.map((scope) => [scope.companyId, scope.codColigada, scope.codFilial])).toEqual([
      ["santa", 2, 1],
      ["jacutinga", 2, 2],
    ]);
    expect(sourceColigadasForScopes(scopes)).toEqual([0, 2]);
  });

  it("shares rows without CODFILIAL and isolates branch-specific rows", () => {
    const [santa, jacutinga] = resolveTotvsCompanyScopes(
      { mode: "FILIAL", mainColigadaId: 2 },
      companies,
      "DEFAULT",
    );
    const rows: Record<string, unknown>[] = [
      { coligada: 0, code: "ZERO", description: "Coligada global" },
      { coligada: 2, code: "SHARED", description: "Comum" },
      { coligada: 2, filial: 1, code: "LOCAL", description: "Santa" },
      { coligada: 2, filial: 2, code: "LOCAL", description: "Jacutinga" },
      { coligada: 2, filial: 1, code: "ONLY-1", description: "Santa" },
      { coligada: 2, filial: 2, code: "ONLY-2", description: "Jacutinga" },
    ];
    expect(rowsForTotvsScope(rows, santa, (row) => String(row.code), true)).toEqual([
      rows[0], rows[1], rows[2], rows[4],
    ]);
    expect(rowsForTotvsScope(rows, jacutinga, (row) => String(row.code), true)).toEqual([
      rows[0], rows[1], rows[3], rows[5],
    ]);
  });

  it("keeps identical global products in each company", () => {
    const scopes = resolveTotvsCompanyScopes(
      { mode: "FILIAL", mainColigadaId: 2 },
      companies,
      "DEFAULT",
    );
    const products = [{ coligada: 2, code: "01.001", description: "Ração" }];
    expect(
      scopes.map((scope) => rowsForTotvsScope(products, scope, (row) => String(row.code), false)),
    ).toEqual([products, products]);
  });

  it("does not resolve incomplete branch mappings", () => {
    expect(
      resolveTotvsCompanyScopes(
        { mode: "FILIAL", mainColigadaId: 2 },
        [{ ...companies[0], filialId: null }],
        "DEFAULT",
      ),
    ).toEqual([]);
  });
});

