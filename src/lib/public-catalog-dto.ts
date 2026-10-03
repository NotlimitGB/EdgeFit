import type { CanonicalCatalogItem, CanonicalSizeVariant } from "@/types/canonical-catalog";
import { compareCanonicalFeatured, compareCanonicalPriceAsc, compareCanonicalPriceDesc,
  getCanonicalAvailabilityPreview, getCanonicalDescription, getCanonicalWidthTypes,
  normalizeCatalogSearch } from "@/components/catalog/canonical-catalog-ui";
import type { WidthType } from "@/types/domain";

/** Presentation-only projection. Canonical truth remains on the server. */
export type PublicCatalogSize = Pick<CanonicalSizeVariant,
  "displaySizeLabel" | "widthType" | "isAvailable" | "offerIsActive">;

export interface PublicCatalogItem extends Pick<CanonicalCatalogItem,
  "slug" | "brand" | "modelName" | "seasonLabel" | "priceFrom" | "defaultOfferSlug" | "media"> {
  canonicalSpecs: Pick<CanonicalCatalogItem["canonicalSpecs"],
    "descriptionShort" | "ridingStyle" | "skillLevel" | "boardLine" | "shapeType" |
    "camberProfile">;
  searchText: string;
  availableSizeCount: number;
  availabilityPreview: string;
  widthTypes: WidthType[];
  sortRanks?: { featured: number; priceAsc: number; priceDesc: number };
}

// Single-card projection; catalog ordering must use the bulk ranked projection below.
export function toPublicCatalogItem(board: CanonicalCatalogItem): PublicCatalogItem {
  const { ridingStyle, skillLevel, boardLine, shapeType,
    camberProfile } = board.canonicalSpecs;
  return {
    slug: board.slug, brand: board.brand, modelName: board.modelName,
    seasonLabel: board.seasonLabel, priceFrom: board.priceFrom,
    defaultOfferSlug: board.defaultOfferSlug,
    media: [...new Set(board.media.map((url) => url.trim()).filter(Boolean))],
    canonicalSpecs: { descriptionShort: getCanonicalDescription(board), ridingStyle, skillLevel, boardLine,
      shapeType, camberProfile },
    searchText: normalizeCatalogSearch([board.brand, board.modelName, board.slug,
      ...board.offers.map((offer) => offer.offerSlug)].join(" ")),
    availableSizeCount: board.sizes.filter((size) => size.offerIsActive && size.isAvailable).length,
    availabilityPreview: getCanonicalAvailabilityPreview(board),
    widthTypes: getCanonicalWidthTypes(board),
  };
}

export function toPublicCatalogItems(boards: CanonicalCatalogItem[]): PublicCatalogItem[] {
  const ranks = [compareCanonicalFeatured, compareCanonicalPriceAsc, compareCanonicalPriceDesc]
    .map((compare) => new Map([...boards].sort(compare).map((board, index) => [board.slug, index])));
  return boards.map((board) => ({ ...toPublicCatalogItem(board), sortRanks: {
    featured: ranks[0].get(board.slug)!, priceAsc: ranks[1].get(board.slug)!, priceDesc: ranks[2].get(board.slug)!,
  } }));
}
