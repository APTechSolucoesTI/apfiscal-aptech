import { describe, expect, it } from "vitest";
import { mergeGlobalRows, sourceColigada } from "./totvs-global-rows";

describe("TOTVS global coligada rows", () => {
  const rows: Record<string, unknown>[] = [
    { coligada: 0, code: "GLOBAL", description: "Global" },
    { coligada: 0, code: "SHARED", description: "Global shared" },
    { coligada: 1, code: "SHARED", description: "Company 1 shared" },
    { coligada: 1, code: "ONLY-1", description: "Only company 1" },
    { coligada: 2, code: "ONLY-2", description: "Only company 2" },
  ];

  it("distributes global rows and keeps only the target company's specific rows", () => {
    expect(mergeGlobalRows(rows, 1, (row) => String(row.code)).map((row) => row.code)).toEqual([
      "GLOBAL", "SHARED", "ONLY-1",
    ]);
    expect(mergeGlobalRows(rows, 2, (row) => String(row.code)).map((row) => row.code)).toEqual([
      "GLOBAL", "SHARED", "ONLY-2",
    ]);
  });

  it("gives precedence to a company-specific row with the same business key", () => {
    const merged = mergeGlobalRows(rows, 1, (row) => String(row.code));
    expect(merged.find((row) => row.code === "SHARED")?.description).toBe("Company 1 shared");
  });

  it("reads both supported RM coligada aliases", () => {
    expect(sourceColigada({ coligada: 0 })).toBe(0);
    expect(sourceColigada({ codcoligada: "2" })).toBe(2);
    expect(sourceColigada({})).toBeNull();
  });
});
