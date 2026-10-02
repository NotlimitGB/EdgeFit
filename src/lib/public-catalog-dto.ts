import type { CanonicalCatalogItem, CanonicalSizeVariant } from "@/types/canonical-catalog";

/** Presentation-only projection. Canonical truth remains on the server. */
export type PublicCatalogSize = Pick<CanonicalSizeVariant,
  "displaySizeLabel" | "widthType" | "isAvailable" | "offerIsActive">;

export interface PublicCatalogItem extends Pick<CanonicalCatalogItem,
  "slug" | "brand" | "modelName" | "seasonLabel" | "priceFrom" | "defaultOfferSlug" | "media"> {
  canonicalSpecs: Pick<CanonicalCatalogItem["canonicalSpecs"],
    "descriptionShort" | "ridingStyle" | "skillLevel" | "boardLine" | "shapeType" |
    "camberProfile" | "dataStatus" | "sourceCheckedAt">;
  offers: { offerSlug: string }[];
  sizes: PublicCatalogSize[];
}

export function toPublicCatalogItem(board: CanonicalCatalogItem): PublicCatalogItem {
  const { descriptionShort, ridingStyle, skillLevel, boardLine, shapeType,
    camberProfile, dataStatus, sourceCheckedAt } = board.canonicalSpecs;
  return {
    slug: board.slug, brand: board.brand, modelName: board.modelName,
    seasonLabel: board.seasonLabel, priceFrom: board.priceFrom,
    defaultOfferSlug: board.defaultOfferSlug, media: [...board.media],
    canonicalSpecs: { descriptionShort, ridingStyle, skillLevel, boardLine,
      shapeType, camberProfile, dataStatus, sourceCheckedAt },
    offers: board.offers.map(({ offerSlug }) => ({ offerSlug })),
    sizes: board.sizes.map(({ displaySizeLabel, widthType, isAvailable, offerIsActive }) =>
      ({ displaySizeLabel, widthType, isAvailable, offerIsActive })),
  };
}
