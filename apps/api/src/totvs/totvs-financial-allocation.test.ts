import { describe, expect, it } from "vitest";
import { financialInstallmentAllocations } from "./totvs-financial-allocation";

describe("TOTVS financial installment allocation", () => {
  it("allocates the whole installment to a single cost center", () => {
    expect(financialInstallmentAllocations([{ costCenterCode: "01.001", value: 500 }], 125)).toEqual([
      { costCenterCode: "01.001", value: 125, percentage: 100 },
    ]);
  });

  it("distributes values proportionally and absorbs rounding in the last row", () => {
    const result = financialInstallmentAllocations(
      [
        { costCenterCode: "01.001", value: 1 },
        { costCenterCode: "01.002", value: 1 },
        { costCenterCode: "01.003", value: 1 },
      ],
      100,
    );

    expect(result.map((allocation) => allocation.value)).toEqual([33.33, 33.33, 33.34]);
    expect(result.reduce((sum, allocation) => sum + allocation.value, 0)).toBe(100);
    expect(result.reduce((sum, allocation) => sum + allocation.percentage, 0)).toBe(100);
  });

  it("uses the allocation sum as the proportional basis", () => {
    expect(
      financialInstallmentAllocations(
        [
          { costCenterCode: "01.001", value: 300 },
          { costCenterCode: "01.002", value: 100 },
        ],
        200,
      ),
    ).toEqual([
      { costCenterCode: "01.001", value: 150, percentage: 75 },
      { costCenterCode: "01.002", value: 50, percentage: 25 },
    ]);
  });
});
