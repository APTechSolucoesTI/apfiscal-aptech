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
  if (!Number.isFinite(discount) || !Number.isFinite(basis) || discount <= 0 || basis <= 0)
    return 0;
  return Math.round(((discount * 100) / basis + Number.EPSILON) * 10_000) / 10_000;
}

export function nfseNatureCode(
  companyState: string | null | undefined,
  supplierState: string | null | undefined,
) {
  const company = companyState?.trim().toUpperCase();
  const supplier = supplierState?.trim().toUpperCase();
  if (!company || !supplier) return null;
  return company === supplier ? "1.933.001" : "2.933.001";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function state(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : null;
}

export function nfseIssuerState(
  supplierState: string | null | undefined,
  nfseDetails: unknown,
  rawIssuer: unknown,
) {
  const detailsIssuer = record(record(nfseDetails).issuer);
  const detailsAddress = record(detailsIssuer.address);
  const issuer = record(rawIssuer);
  const rawAddress = record(issuer.enderNac ?? issuer.enderEmit ?? issuer.endereco ?? issuer.end);
  const nestedNational = record(rawAddress.endNac);
  return (
    state(supplierState) ??
    state(detailsAddress.state ?? detailsAddress.UF ?? detailsAddress.uf) ??
    state(rawAddress.UF ?? rawAddress.uf ?? nestedNational.UF ?? nestedNational.uf) ??
    state(issuer.UF ?? issuer.uf)
  );
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
