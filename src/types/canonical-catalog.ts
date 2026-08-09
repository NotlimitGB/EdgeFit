import type {
  BoardShape,
  CamberProfile,
  Product,
  ProductDataStatus,
  ProductSize,
  RidingStyle,
  SkillLevel,
} from "@/types/domain";

export type CanonicalSourceKind =
  | "verified-official"
  | "manual"
  | "trusted-member"
  | "fallback-member";

export type CanonicalFamilyMemberRole = "base" | "wide" | "other";

export type CanonicalFamilyMatchConfidence = "high" | "reviewed";

export interface CanonicalCatalogSpecs {
  descriptionShort: string | null;
  descriptionFull: string | null;
  ridingStyle: RidingStyle | null;
  skillLevel: SkillLevel | null;
  flex: number | null;
  boardLine: Product["boardLine"] | null;
  shapeType: BoardShape | null;
  camberProfile: CamberProfile | null;
  dataStatus: ProductDataStatus;
  canonicalSourceKind: CanonicalSourceKind | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceCheckedAt: string | null;
}

export interface SourceOfferSummary {
  offerId: string;
  offerSlug: string;
  memberRole: CanonicalFamilyMemberRole | null;
  familyMatchMethod: string | null;
  familyMatchConfidence: CanonicalFamilyMatchConfidence | null;
  familyManualOverride: boolean;
  priceFrom: number;
  isActive: boolean;
  hasAvailableSize: boolean;
  isFulfillable: boolean;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceCheckedAt: string | null;
  dataStatus: ProductDataStatus;
}

export interface CanonicalSizeVariant extends Omit<ProductSize, "sizeLabel"> {
  sourceSizeId: string;
  offerId: string;
  offerSlug: string;
  memberRole: CanonicalFamilyMemberRole | null;
  offerIsActive: boolean;
  rawSizeLabel: string | null;
  displaySizeLabel: string;
  sizeLabel: string;
}

export interface CanonicalCatalogItem {
  familyId: string | null;
  slug: string;
  brand: string;
  modelName: string;
  seasonLabel: string | null;
  canonicalSpecs: CanonicalCatalogSpecs;
  offers: SourceOfferSummary[];
  sizes: CanonicalSizeVariant[];
  priceFrom: number | null;
  isActive: boolean;
  hasAvailableSize: boolean;
  media: string[];
  defaultOfferSlug: string | null;
}
