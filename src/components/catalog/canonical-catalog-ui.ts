import { formatMoney, boardShapeLabels, ridingStyleLabels } from "@/lib/content";
import type {
  PublicCatalogItem,
  PublicCatalogSize as CanonicalSizeVariant,
} from "@/lib/public-catalog-dto";
import type { WidthType } from "@/types/domain";
import type { CanonicalCatalogItem as FullCanonicalItem } from "@/types/canonical-catalog";
type CanonicalCatalogItem = PublicCatalogItem | FullCanonicalItem;

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

export function normalizeCatalogSearch(value: string) {
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

export function getCanonicalActiveSizes<T extends CanonicalSizeVariant>(
  board: { sizes: T[] },
): T[] {
  return board.sizes.filter((size) => size.offerIsActive);
}

export function getCanonicalAvailableSizes<T extends CanonicalSizeVariant>(
  board: { sizes: T[] },
): T[] {
  return getCanonicalActiveSizes(board).filter((size) => size.isAvailable);
}

export function getCanonicalFilterSizes<T extends CanonicalSizeVariant>(
  board: { sizes: T[] },
): T[] {
  const availableSizes = getCanonicalAvailableSizes(board);
  return availableSizes.length > 0
    ? availableSizes
    : getCanonicalActiveSizes(board);
}

export function getCanonicalAvailableSizeCount(board: CanonicalCatalogItem) {
  if ("availableSizeCount" in board) return board.availableSizeCount;
  return getCanonicalAvailableSizes(board).length;
}

export function getCanonicalWidthTypes(
  board: CanonicalCatalogItem,
): WidthType[] {
  if ("widthTypes" in board) return board.widthTypes;
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
    return "Доступность не подтверждена";
  }

  return `В данных SnowDex отмечено: ${sizeCount} ${pluralizeSize(sizeCount)}`;
}

export function getCanonicalAvailabilityPreview(
  board: CanonicalCatalogItem,
  limit = 5,
) {
  if ("availabilityPreview" in board && limit === 5) return board.availabilityPreview;
  if (!("sizes" in board)) throw new Error("Custom preview limits require canonical sizes");
  const labels = getCanonicalAvailableSizes(board)
    .map((size) => size.displaySizeLabel.trim())
    .filter(Boolean);

  if (labels.length === 0) {
    return "Проверь наличие в магазине.";
  }

  const preview = labels.slice(0, limit).join(", ");
  const remainder = labels.length - limit;

  return remainder > 0
    ? `Отмеченные размеры: ${preview} + ещё ${remainder}.`
    : `Отмеченные размеры: ${preview}.`;
}

export function matchesCanonicalCatalogSearch(
  board: CanonicalCatalogItem,
  query: string,
) {
  const normalizedQuery = normalizeCatalogSearch(query);

  if (!normalizedQuery) {
    return true;
  }

  if ("searchText" in board) return board.searchText.includes(normalizedQuery);
  const searchValues = [
    board.brand,
    board.modelName,
    board.slug,
    ...board.offers.map((offer) => offer.offerSlug),
  ];
  const haystack = normalizeCatalogSearch(searchValues.join(" "));

  return haystack.includes(normalizedQuery);
}

export function compareCanonicalPriceAsc(
  left: CanonicalCatalogItem,
  right: CanonicalCatalogItem,
) {
  if ("sortRanks" in left && left.sortRanks && "sortRanks" in right && right.sortRanks)
    return left.sortRanks.priceAsc - right.sortRanks.priceAsc;
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
  if ("sortRanks" in left && left.sortRanks && "sortRanks" in right && right.sortRanks)
    return left.sortRanks.priceDesc - right.sortRanks.priceDesc;
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
  if ("sortRanks" in left && left.sortRanks && "sortRanks" in right && right.sortRanks)
    return left.sortRanks.featured - right.sortRanks.featured;
  const verifiedDelta =
    Number("dataStatus" in right.canonicalSpecs && right.canonicalSpecs.dataStatus === "verified") -
    Number("dataStatus" in left.canonicalSpecs && left.canonicalSpecs.dataStatus === "verified");

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
    checkedAtValue("sourceCheckedAt" in right.canonicalSpecs ? right.canonicalSpecs.sourceCheckedAt : null) -
    checkedAtValue("sourceCheckedAt" in left.canonicalSpecs ? left.canonicalSpecs.sourceCheckedAt : null);
  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  return compareCanonicalPriceAsc(left, right);
}

export function getCanonicalDescription(board: CanonicalCatalogItem) {
  const description = board.canonicalSpecs.descriptionShort?.trim();
  if (description) return description;
  const { boardLine, ridingStyle, shapeType, skillLevel } = board.canonicalSpecs;
  const lines = { men: "Мужская", women: "Женская", unisex: "Универсальная" };
  const identity = [boardLine ? lines[boardLine] : null, ridingStyle ? ridingStyleLabels[ridingStyle] : null].filter(Boolean);
  const shape = shapeType ? boardShapeLabels[shapeType] : null;
  const first = identity.length ? `${identity.join(" ")} доска${shape ? ` с формой ${shape}` : ""}.`
    : shape ? `Модель с формой ${shape}.` : "";
  const hints = {
    beginner: "Характеристики ориентированы на первые сезоны и спокойный прогресс.",
    intermediate: "Характеристики лучше раскрываются на среднем уровне и при уверенном базовом катании.",
    advanced: "Характеристики рассчитаны на уверенное катание и заметную нагрузку на доску.",
  };
  return [first, skillLevel ? hints[skillLevel] : ""].filter(Boolean).join(" ")
    || "Сравни геометрию, доступные размеры и характеристики модели.";
}

export function getCanonicalPricePresentation(price: number | null) {
  return isKnownCanonicalPrice(price)
    ? { label: "Ориентир цены", value: formatMoney(price) }
    : { label: "Ориентир цены", value: "нет данных" };
}
