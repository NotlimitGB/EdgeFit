/** Explicit presentation aliases only; canonical catalog truth is unchanged. */
export function normalizeCatalogBrand(value: string): string {
  const brand = value.trim();
  return brand === "Capita" || brand === "CAPiTA" ? "CAPiTA" : brand;
}

export function getCatalogBrands(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeCatalogBrand).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "ru"));
}
