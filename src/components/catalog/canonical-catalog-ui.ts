import { formatMoney } from "@/lib/content";
import type {
  CanonicalCatalogItem,
  CanonicalSizeVariant,
} from "@/types/canonical-catalog";
import type { WidthType } from "@/types/domain";

const WIDTH_ORDER: readonly WidthType[] = ["regular", "mid-wide", "wide"];

function pluralizeSize(count: number) {
  const remainder10 = count % 10;
  const remainder100 = count % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return "размер";
  }

  if (
    remainder10 >= 2 &&
    remainder10 <= 4 &&
    (remainder100 < 12 || remainder100 > 14)
  ) {
    return "размера";
  }

  return "размеров";
}

function compareIdentity(
  left: CanonicalCatalogItem,
  right: CanonicalCatalogItem,
) {
  return (
    left.brand.localeCompare(right.brand, "ru") ||
    left.modelName.localeCompare(right.modelName, "ru") ||
    left.slug.localeCompare(right.slug, "ru")
  );
}

function checkedAtValue(value: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeSearchValue(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isKnownCanonicalPrice(
  price: number | null,
): price is number {
  return price != null && Number.isFinite(price) && price > 0;
}

export function getCanonicalActiveSizes(
  board: CanonicalCatalogItem,
): CanonicalSizeVariant[] {
  return board.sizes.filter((size) => size.offerIsActive);
}

export function getCanonicalAvailableSizes(
  board: CanonicalCatalogItem,
): CanonicalSizeVariant[] {
  return getCanonicalActiveSizes(board).filter((size) => size.isAvailable);
}

export function getCanonicalFilterSizes(
  board: CanonicalCatalogItem,
): CanonicalSizeVariant[] {
  const availableSizes = getCanonicalAvailableSizes(board);
  return availableSizes.length > 0
    ? availableSizes
    : getCanonicalActiveSizes(board);
}

export function getCanonicalAvailableSizeCount(board: CanonicalCatalogItem) {
  return getCanonicalAvailableSizes(board).length;
}

export function getCanonicalWidthTypes(
  board: CanonicalCatalogItem,
): WidthType[] {
  const selectedWidths = new Set(
    getCanonicalFilterSizes(board).map((size) => size.widthType),
  );

  return WIDTH_ORDER.filter((widthType) => selectedWidths.has(widthType));
}

export function getCanonicalWidthSummary(board: CanonicalCatalogItem) {
  const widthTypes = getCanonicalWidthTypes(board);

  if (widthTypes.length === 0) {
    return "ширина уточняется";
  }

  if (widthTypes.length === 1) {
    switch (widthTypes[0]) {
      case "regular":
        return "обычная ширина";
      case "mid-wide":
        return "mid-wide";
      case "wide":
        return "wide";
    }
  }

  return widthTypes
    .map((widthType) =>
      widthType === "regular" ? "обычная" : widthType,
    )
    .join(" + ");
}

export function getCanonicalAvailabilityHeadline(
  board: CanonicalCatalogItem,
) {
  const sizeCount = getCanonicalAvailableSizeCount(board);

  if (sizeCount === 0) {
    return "Сейчас нет доступных размеров";
  }

  return `В наличии ${sizeCount} ${pluralizeSize(sizeCount)}`;
}

export function getCanonicalAvailabilityPreview(
  board: CanonicalCatalogItem,
  limit = 5,
) {
  const labels = getCanonicalAvailableSizes(board)
    .map((size) => size.displaySizeLabel.trim())
    .filter(Boolean);

  if (labels.length === 0) {
    return "Доступные размеры в магазине сейчас не подтверждены.";
  }

  const preview = labels.slice(0, limit).join(", ");
  const remainder = labels.length - limit;

  return remainder > 0
    ? `Сейчас: ${preview} + ещё ${remainder}.`
    : `Сейчас: ${preview}.`;
}

export function matchesCanonicalCatalogSearch(
  board: CanonicalCatalogItem,
  query: string,
) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  const searchValues = [
    board.brand,
    board.modelName,
    board.slug,
    ...board.offers.map((offer) => offer.offerSlug),
  ];
  const haystack = normalizeSearchValue(searchValues.join(" "));

  return haystack.includes(normalizedQuery);
}

export function compareCanonicalPriceAsc(
  left: CanonicalCatalogItem,
  right: CanonicalCatalogItem,
) {
  const leftPrice = left.priceFrom;
  const rightPrice = right.priceFrom;
  const leftKnown = isKnownCanonicalPrice(leftPrice);
  const rightKnown = isKnownCanonicalPrice(rightPrice);

  if (leftKnown !== rightKnown) {
    return leftKnown ? -1 : 1;
  }

  if (leftKnown && rightKnown && leftPrice !== rightPrice) {
    return leftPrice - rightPrice;
  }

  return compareIdentity(left, right);
}

export function compareCanonicalPriceDesc(
  left: CanonicalCatalogItem,
  right: CanonicalCatalogItem,
) {
  const leftPrice = left.priceFrom;
  const rightPrice = right.priceFrom;
  const leftKnown = isKnownCanonicalPrice(leftPrice);
  const rightKnown = isKnownCanonicalPrice(rightPrice);

  if (leftKnown !== rightKnown) {
    return leftKnown ? -1 : 1;
  }

  if (leftKnown && rightKnown && leftPrice !== rightPrice) {
    return rightPrice - leftPrice;
  }

  return compareIdentity(left, right);
}

export function compareCanonicalFeatured(
  left: CanonicalCatalogItem,
  right: CanonicalCatalogItem,
) {
  const verifiedDelta =
    Number(right.canonicalSpecs.dataStatus === "verified") -
    Number(left.canonicalSpecs.dataStatus === "verified");

  if (verifiedDelta !== 0) {
    return verifiedDelta;
  }

  const availableDelta =
    getCanonicalAvailableSizeCount(right) -
    getCanonicalAvailableSizeCount(left);
  if (availableDelta !== 0) {
    return availableDelta;
  }

  const freshnessDelta =
    checkedAtValue(right.canonicalSpecs.sourceCheckedAt) -
    checkedAtValue(left.canonicalSpecs.sourceCheckedAt);
  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  return compareCanonicalPriceAsc(left, right);
}

export function getCanonicalPricePresentation(price: number | null) {
  return isKnownCanonicalPrice(price)
    ? { label: "Цена от", value: formatMoney(price) }
    : { label: "Цена", value: "Цена уточняется" };
}
