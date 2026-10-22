import type { PublicCatalogItem } from "@/lib/public-catalog-dto";
import { matchesCanonicalCatalogSearch, isKnownCanonicalPrice } from "./canonical-catalog-ui";
import { normalizeCatalogBrand, getCatalogBrands } from "./catalog-brand";
import type { CatalogUrlState } from "./catalog-state";

const collator = new Intl.Collator("ru", { sensitivity: "base" });
const unique = (values: string[]) => [...new Set(values)].sort(collator.compare);
export function catalogModelCount(count: number) {
  const ten = count % 10, hundred = count % 100;
  const noun = ten === 1 && hundred !== 11 ? "модель" : ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14) ? "модели" : "моделей";
  return `${count} ${noun}`;
}
export function catalogFacets(boards: PublicCatalogItem[]) {
  return {
    brands: getCatalogBrands(boards.map((b) => b.brand)),
    seasons: unique(boards.flatMap((b) => b.seasonLabel ? [b.seasonLabel] : [])),
    cambers: unique(boards.flatMap((b) => b.canonicalSpecs.camberProfile ? [b.canonicalSpecs.camberProfile] : [])),
    sizes: unique(boards.flatMap((b) => (b.recordedVariants ?? []).map((v) => String(v.sizeCm))))
      .sort((a, b) => Number(a) - Number(b)),
  };
}
function seasonOrder(a: string | null, b: string | null) {
  const year = (value: string | null) => {
    const match = /^(\d{4})\/(\d{4})$/.exec(value ?? "");
    return match && Number(match[2]) === Number(match[1]) + 1 ? Number(match[1]) : null;
  };
  const ay = year(a), by = year(b);
  if (ay !== null || by !== null) return (by ?? -Infinity) - (ay ?? -Infinity);
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return collator.compare(a, b);
}
export function compareCatalogIdentity(a: PublicCatalogItem, b: PublicCatalogItem) {
  return collator.compare(a.brand, b.brand) || collator.compare(a.modelName, b.modelName)
    || seasonOrder(a.seasonLabel, b.seasonLabel) || a.slug.localeCompare(b.slug);
}
export function selectCatalog(boards: PublicCatalogItem[], state: CatalogUrlState) {
  return boards.filter((board) => {
    const specs = board.canonicalSpecs;
    const match = (values: readonly string[] | undefined, value: string | null) => !values?.length || (value !== null && values.includes(value));
    if (!matchesCanonicalCatalogSearch(board, state.q)
      || !match(state.brands, normalizeCatalogBrand(board.brand))
      || !match(state.styles, specs.ridingStyle) || !match(state.skills, specs.skillLevel)
      || !match(state.shapes, specs.shapeType) || !match(state.lines, specs.boardLine)
      || !match(state.seasons, board.seasonLabel) || !match(state.cambers, specs.camberProfile)) return false;
    if (state.sizes?.length || state.widths.length) {
      // Both predicates must match the SAME recorded variant, never historical stock.
      if (board.recordedVariants) return board.recordedVariants.some((v) => match(state.sizes, String(v.sizeCm)) && match(state.widths, v.widthType));
      return !state.sizes?.length && board.widthTypes.some((v) => state.widths.includes(v));
    }
    return true;
  }).sort((a, b) => {
    if (state.sort === "season-desc") return seasonOrder(a.seasonLabel, b.seasonLabel) || compareCatalogIdentity(a, b);
    if (state.sort === "price-asc" || state.sort === "price-desc") {
      const ak = isKnownCanonicalPrice(a.priceFrom), bk = isKnownCanonicalPrice(b.priceFrom);
      if (ak !== bk) return ak ? -1 : 1;
      if (ak && bk && a.priceFrom !== b.priceFrom) return (state.sort === "price-asc" ? 1 : -1) * (a.priceFrom! - b.priceFrom!);
    }
    return compareCatalogIdentity(a, b);
  });
}
