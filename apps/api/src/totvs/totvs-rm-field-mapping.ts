const PURCHASE_TYPE_TO_MERCHANDISE_SITUATION: Readonly<Record<string, string>> = {
  "00": "01", // Mercadoria para revenda
  "01": "02", // Materia-prima
  "02": "08", // Embalagem
  "03": "03", // Produto em elaboracao/processo
  "04": "04", // Produto acabado
  "05": "09", // Subproduto
  "06": "10", // Produto intermediario
  "07": "11", // Material de uso e consumo
  "08": "12", // Ativo imobilizado
  "09": "13", // Servicos
  "10": "15", // Outros insumos
  "99": "14", // Outras mercadorias/produtos
};

export function merchandiseSituation(purchaseTypeCode: string | null | undefined) {
  if (!purchaseTypeCode) return null;
  return PURCHASE_TYPE_TO_MERCHANDISE_SITUATION[purchaseTypeCode.trim()] ?? null;
}

export function discountPercentage(discount: number, basis: number) {
  if (!Number.isFinite(discount) || !Number.isFinite(basis) || discount <= 0 || basis <= 0) return 0;
  return Math.round(((discount * 100) / basis + Number.EPSILON) * 10_000) / 10_000;
}

export function icmsOrigin(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const [key, candidate] of Object.entries(record)) {
    if (key.toLowerCase() === "orig") {
      const origin = Number(candidate);
      if (Number.isInteger(origin) && origin >= 0 && origin <= 8) return origin;
    }
  }
  for (const candidate of Object.values(record)) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const origin = icmsOrigin(item);
        if (origin !== null) return origin;
      }
      continue;
    }
    const origin = icmsOrigin(candidate);
    if (origin !== null) return origin;
  }
  return null;
}
