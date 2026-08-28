export type FinancialAllocation = {
  costCenterCode: string;
  value: number;
};

export type FinancialInstallmentAllocation = FinancialAllocation & {
  percentage: number;
};

function round(value: number, decimalPlaces: number) {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Recalcula o rateio do documento para o valor de cada parcela. */
export function financialInstallmentAllocations(
  allocations: FinancialAllocation[],
  installmentValue: number,
): FinancialInstallmentAllocation[] {
  const valid = allocations.filter(
    (allocation) =>
      allocation.costCenterCode.trim().length > 0 && Number.isFinite(allocation.value),
  );
  if (valid.length === 0) return [];

  const weights = valid.map((allocation) => Math.max(0, allocation.value));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const normalizedWeights = weightTotal > 0 ? weights : valid.map(() => 1);
  const normalizedTotal = normalizedWeights.reduce((sum, value) => sum + value, 0);
  let allocatedValue = 0;
  let allocatedPercentage = 0;

  return valid.map((allocation, index) => {
    const isLast = index === valid.length - 1;
    const value = isLast
      ? round(installmentValue - allocatedValue, 2)
      : round((installmentValue * normalizedWeights[index]) / normalizedTotal, 2);
    const percentage = isLast
      ? round(100 - allocatedPercentage, 4)
      : round((normalizedWeights[index] * 100) / normalizedTotal, 4);
    allocatedValue = round(allocatedValue + value, 2);
    allocatedPercentage = round(allocatedPercentage + percentage, 4);
    return { costCenterCode: allocation.costCenterCode, value, percentage };
  });
}
