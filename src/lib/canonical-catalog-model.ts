import { formatBoardSizeValue, getBoardSizeLabel } from "@/lib/board-size";
import type {
  CanonicalCatalogItem,
  CanonicalCatalogSpecs,
  CanonicalFamilyMatchConfidence,
  CanonicalFamilyMemberRole,
  CanonicalSizeVariant,
  CanonicalSourceKind,
  SourceOfferSummary,
} from "@/types/canonical-catalog";
import type {
  BoardShape,
  CamberProfile,
  Product,
  ProductDataStatus,
  RidingStyle,
  SkillLevel,
  WidthType,
} from "@/types/domain";

export interface CanonicalFamilySource {
  id: string;
  slug: string;
  brand: string;
  modelName: string;
  seasonLabel: string;
  descriptionShort: string | null;
  descriptionFull: string | null;
  ridingStyle: RidingStyle | null;
  skillLevel: SkillLevel | null;
  flex: number | string | null;
  boardLine: Product["boardLine"] | null;
  shapeType: BoardShape | null;
  camberProfile: CamberProfile | null;
  canonicalSourceKind: CanonicalSourceKind | null;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceCheckedAt: string | null;
  dataStatus: ProductDataStatus;
}

export interface CanonicalOfferSizeSource {
  id: string;
  sizeCm: number | string;
  sizeLabel: string | null;
  waistWidthMm: number | string;
  recommendedWeightMin: number | string;
  recommendedWeightMax: number | string | null;
  widthType: WidthType;
  isAvailable: boolean;
}

export interface CanonicalOfferSource {
  id: string;
  slug: string;
  brand: string;
  modelName: string;
  seasonLabel: string | null;
  descriptionShort: string;
  descriptionFull: string;
  ridingStyle: RidingStyle;
  skillLevel: SkillLevel;
  flex: number | string;
  boardLine: Product["boardLine"];
  shapeType: BoardShape | null;
  camberProfile: CamberProfile | null;
  dataStatus: ProductDataStatus;
  priceFrom: number | string;
  imageUrl: string;
  galleryImages: unknown;
  isActive: boolean;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceCheckedAt: string | null;
  familyId: string | null;
  memberRole: CanonicalFamilyMemberRole | null;
  familyMatchMethod: string | null;
  familyMatchConfidence: CanonicalFamilyMatchConfidence | null;
  familyManualOverride: boolean;
  sizes: readonly CanonicalOfferSizeSource[];
}

const WIDTH_ORDER: Record<WidthType, number> = {
  regular: 0,
  "mid-wide": 1,
  wide: 2,
};

const ROLE_ORDER: Record<CanonicalFamilyMemberRole, number> = {
  base: 0,
  wide: 1,
  other: 2,
};

function compareText(left: string, right: string) {
  return left.localeCompare(right, "en");
}

function memberRoleOrder(role: CanonicalFamilyMemberRole | null) {
  return role == null ? 3 : ROLE_ORDER[role];
}

function nullableText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeGalleryImages(value: unknown) {
  const rawImages =
    typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : Array.isArray(value)
        ? value
        : [];

  return rawImages
    .map((image) => String(image ?? "").trim())
    .filter(Boolean);
}

function isExplicitWideLabel(label: string) {
  return /^\d+(?:[.,]\d+)?w$/iu.test(label);
}

function canDeriveWideLabel(
  memberRole: CanonicalFamilyMemberRole | null,
  familyMatchMethod: string | null,
  familyManualOverride: boolean,
  widthType: WidthType,
) {
  if (memberRole !== "wide" || widthType !== "wide") {
    return false;
  }

  return (
    familyMatchMethod === "audit-high-v1" ||
    (familyMatchMethod === "manual" && familyManualOverride)
  );
}

export function getCanonicalSizeDisplayLabel(
  size: Pick<CanonicalOfferSizeSource, "sizeCm" | "sizeLabel" | "widthType">,
  membership: Pick<
    CanonicalOfferSource,
    "memberRole" | "familyMatchMethod" | "familyManualOverride"
  >,
) {
  const sizeCm = Number(size.sizeCm);
  const normalizedLabel = getBoardSizeLabel({
    sizeCm,
    sizeLabel: size.sizeLabel,
  });

  if (isExplicitWideLabel(normalizedLabel)) {
    return `${normalizedLabel.slice(0, -1)}W`;
  }

  if (
    canDeriveWideLabel(
      membership.memberRole,
      membership.familyMatchMethod,
      membership.familyManualOverride,
      size.widthType,
    )
  ) {
    return `${formatBoardSizeValue(sizeCm)}W`;
  }

  return normalizedLabel;
}

function isReliableStoredSize(size: CanonicalSizeVariant) {
  if (!Number.isFinite(size.sizeCm) || !Number.isFinite(size.waistWidthMm)) {
    return false;
  }

  if (size.sizeCm >= 100) {
    return true;
  }

  return size.waistWidthMm < 235;
}

function normalizeSize(
  size: CanonicalOfferSizeSource,
  offer: CanonicalOfferSource,
): CanonicalSizeVariant | null {
  const sizeCm = Number(size.sizeCm);
  const displaySizeLabel = getCanonicalSizeDisplayLabel(size, offer);
  const normalized: CanonicalSizeVariant = {
    sourceSizeId: String(size.id),
    offerId: String(offer.id),
    offerSlug: offer.slug,
    memberRole: offer.memberRole,
    offerIsActive: offer.isActive,
    rawSizeLabel: size.sizeLabel,
    displaySizeLabel,
    sizeLabel: displaySizeLabel,
    sizeCm,
    waistWidthMm: Number(size.waistWidthMm),
    recommendedWeightMin: Number(size.recommendedWeightMin),
    recommendedWeightMax:
      size.recommendedWeightMax == null
        ? null
        : Number(size.recommendedWeightMax),
    widthType: size.widthType,
    isAvailable: size.isAvailable !== false,
  };

  return isReliableStoredSize(normalized) ? normalized : null;
}

function compareSizes(left: CanonicalSizeVariant, right: CanonicalSizeVariant) {
  return (
    left.sizeCm - right.sizeCm ||
    compareText(left.displaySizeLabel, right.displaySizeLabel) ||
    WIDTH_ORDER[left.widthType] - WIDTH_ORDER[right.widthType] ||
    memberRoleOrder(left.memberRole) - memberRoleOrder(right.memberRole) ||
    compareText(left.offerSlug, right.offerSlug) ||
    compareText(left.sourceSizeId, right.sourceSizeId)
  );
}

function compareOffers(left: CanonicalOfferSource, right: CanonicalOfferSource) {
  return (
    memberRoleOrder(left.memberRole) - memberRoleOrder(right.memberRole) ||
    compareText(left.slug, right.slug) ||
    compareText(String(left.id), String(right.id))
  );
}

function buildOfferSummary(
  offer: CanonicalOfferSource,
  sizes: readonly CanonicalSizeVariant[],
): SourceOfferSummary {
  const offerSizes = sizes.filter((size) => size.offerId === String(offer.id));
  const hasAvailableSize = offerSizes.some((size) => size.isAvailable);

  return {
    offerId: String(offer.id),
    offerSlug: offer.slug,
    memberRole: offer.memberRole,
    familyMatchMethod: nullableText(offer.familyMatchMethod),
    familyMatchConfidence: offer.familyMatchConfidence,
    familyManualOverride: offer.familyManualOverride === true,
    priceFrom: Number(offer.priceFrom),
    isActive: offer.isActive === true,
    hasAvailableSize,
    isFulfillable: offer.isActive === true && hasAvailableSize,
    sourceName: nullableText(offer.sourceName),
    sourceUrl: nullableText(offer.sourceUrl),
    sourceCheckedAt: nullableText(offer.sourceCheckedAt),
    dataStatus: offer.dataStatus ?? "draft",
  };
}

function positivePrice(price: number) {
  return Number.isFinite(price) && price > 0 ? price : Number.POSITIVE_INFINITY;
}

function checkedAtValue(value: string | null) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function getDefaultOfferSlug(offers: readonly SourceOfferSummary[]) {
  const [selected] = offers
    .filter((offer) => offer.isFulfillable)
    .sort(
      (left, right) =>
        positivePrice(left.priceFrom) - positivePrice(right.priceFrom) ||
        memberRoleOrder(left.memberRole) - memberRoleOrder(right.memberRole) ||
        checkedAtValue(right.sourceCheckedAt) -
          checkedAtValue(left.sourceCheckedAt) ||
        compareText(left.offerSlug, right.offerSlug),
    );

  return selected?.offerSlug ?? null;
}

function getMediaForOffers(offers: readonly CanonicalOfferSource[]) {
  const media: string[] = [];
  const seen = new Set<string>();

  for (const offer of [...offers].sort(compareOffers)) {
    const images = [offer.imageUrl, ...normalizeGalleryImages(offer.galleryImages)];

    for (const image of images) {
      const normalized = String(image ?? "").trim();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        media.push(normalized);
      }
    }
  }

  return media;
}

function aggregateMedia(offers: readonly CanonicalOfferSource[]) {
  const activeMedia = getMediaForOffers(offers.filter((offer) => offer.isActive));
  return activeMedia.length > 0
    ? activeMedia
    : getMediaForOffers(offers.filter((offer) => !offer.isActive));
}

function familySpecs(family: CanonicalFamilySource): CanonicalCatalogSpecs {
  return {
    descriptionShort: family.descriptionShort,
    descriptionFull: family.descriptionFull,
    ridingStyle: family.ridingStyle,
    skillLevel: family.skillLevel,
    flex: family.flex == null ? null : Number(family.flex),
    boardLine: family.boardLine,
    shapeType: family.shapeType,
    camberProfile: family.camberProfile,
    dataStatus: family.dataStatus ?? "draft",
    canonicalSourceKind: family.canonicalSourceKind,
    sourceName: nullableText(family.sourceName),
    sourceUrl: nullableText(family.sourceUrl),
    sourceCheckedAt: nullableText(family.sourceCheckedAt),
  };
}

function singletonSpecs(offer: CanonicalOfferSource): CanonicalCatalogSpecs {
  return {
    descriptionShort: offer.descriptionShort,
    descriptionFull: offer.descriptionFull,
    ridingStyle: offer.ridingStyle,
    skillLevel: offer.skillLevel,
    flex: Number(offer.flex),
    boardLine: offer.boardLine,
    shapeType: offer.shapeType,
    camberProfile: offer.camberProfile,
    dataStatus: offer.dataStatus ?? "draft",
    canonicalSourceKind: null,
    sourceName: nullableText(offer.sourceName),
    sourceUrl: nullableText(offer.sourceUrl),
    sourceCheckedAt: nullableText(offer.sourceCheckedAt),
  };
}

function buildItem(
  family: CanonicalFamilySource | null,
  sourceOffers: readonly CanonicalOfferSource[],
): CanonicalCatalogItem | null {
  const offers = [...sourceOffers].sort(compareOffers);
  const activeOffers = offers.filter((offer) => offer.isActive);

  if (activeOffers.length === 0) {
    return null;
  }

  const sizes = offers
    .flatMap((offer) =>
      offer.sizes.map((size) => normalizeSize(size, offer)).filter(Boolean),
    )
    .filter((size): size is CanonicalSizeVariant => size != null)
    .sort(compareSizes);
  const offerSummaries = offers.map((offer) => buildOfferSummary(offer, sizes));
  const activePositivePrices = offerSummaries
    .filter((offer) => offer.isActive && positivePrice(offer.priceFrom) !== Infinity)
    .map((offer) => offer.priceFrom);
  const singleton = family == null ? offers[0] : null;

  if (!family && offers.length !== 1) {
    throw new Error("A singleton canonical item must contain exactly one Product offer.");
  }

  return {
    familyId: family?.id ?? null,
    slug: family?.slug ?? singleton!.slug,
    brand: family?.brand ?? singleton!.brand,
    modelName: family?.modelName ?? singleton!.modelName,
    seasonLabel: nullableText(family?.seasonLabel ?? singleton!.seasonLabel),
    canonicalSpecs: family ? familySpecs(family) : singletonSpecs(singleton!),
    offers: offerSummaries,
    sizes,
    priceFrom:
      activePositivePrices.length > 0 ? Math.min(...activePositivePrices) : null,
    isActive: true,
    hasAvailableSize: offerSummaries.some(
      (offer) => offer.isActive && offer.hasAvailableSize,
    ),
    media: aggregateMedia(offers),
    defaultOfferSlug: getDefaultOfferSlug(offerSummaries),
  };
}

function compareItems(left: CanonicalCatalogItem, right: CanonicalCatalogItem) {
  return (
    compareText(left.brand, right.brand) ||
    compareText(left.modelName, right.modelName) ||
    compareText(left.seasonLabel ?? "", right.seasonLabel ?? "") ||
    compareText(left.slug, right.slug)
  );
}

export function buildCanonicalCatalogItems(
  families: readonly CanonicalFamilySource[],
  offers: readonly CanonicalOfferSource[],
) {
  const familyById = new Map<string, CanonicalFamilySource>();

  for (const family of families) {
    if (familyById.has(String(family.id))) {
      throw new Error(`Duplicate model family ID: ${family.id}.`);
    }
    familyById.set(String(family.id), family);
  }

  const groupedOffers = new Map<string, CanonicalOfferSource[]>();
  const singletonOffers: CanonicalOfferSource[] = [];

  for (const offer of offers) {
    if (offer.familyId == null) {
      if (offer.memberRole != null) {
        throw new Error(
          `Ungrouped Product ${offer.slug} cannot have family role ${offer.memberRole}.`,
        );
      }
      if (offer.isActive) {
        singletonOffers.push(offer);
      }
      continue;
    }

    const familyId = String(offer.familyId);
    if (!familyById.has(familyId)) {
      throw new Error(`Grouped Product ${offer.slug} references missing family ${familyId}.`);
    }
    if (!offer.memberRole || !(offer.memberRole in ROLE_ORDER)) {
      throw new Error(`Grouped Product ${offer.slug} is missing a valid family role.`);
    }

    const members = groupedOffers.get(familyId) ?? [];
    members.push(offer);
    groupedOffers.set(familyId, members);
  }

  const items: CanonicalCatalogItem[] = [];
  for (const family of families) {
    const item = buildItem(family, groupedOffers.get(String(family.id)) ?? []);
    if (item) {
      items.push(item);
    }
  }
  for (const offer of singletonOffers) {
    const item = buildItem(null, [offer]);
    if (item) {
      items.push(item);
    }
  }

  const itemBySlug = new Map<string, CanonicalCatalogItem>();
  for (const item of items) {
    const existing = itemBySlug.get(item.slug);
    if (existing) {
      throw new Error(
        `Duplicate canonical catalog slug ${item.slug} for ${existing.familyId ?? "singleton"} and ${item.familyId ?? "singleton"}.`,
      );
    }
    itemBySlug.set(item.slug, item);
  }

  return items.sort(compareItems);
}
