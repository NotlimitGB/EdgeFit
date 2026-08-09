import { isStoreSpecificationSource } from "@/lib/catalog-readiness";
import { formatCatalogCheckedDate } from "@/lib/catalog-trust";
import { formatMoney } from "@/lib/content";
import { buildStoreRedirectHref } from "@/lib/store-redirect";
import type {
  CanonicalCatalogItem,
  CanonicalCatalogSpecs,
  CanonicalFamilyMemberRole,
  CanonicalSizeVariant,
  SourceOfferSummary,
} from "@/types/canonical-catalog";

const ROLE_ORDER: Record<CanonicalFamilyMemberRole, number> = {
  base: 0,
  wide: 1,
  other: 2,
};

const FLEX_REVIEW_CAPTION =
  "По этой модели источник не даёт надёжной точной оценки, поэтому не показываем жёсткость как конкретный балл.";

export interface CanonicalPricePresentation {
  label: "Цена" | "Цена от";
  value: string;
}

export interface CanonicalFlexPresentation {
  value: string;
  caption: string | null;
}

export interface CanonicalBoardTrustDetails {
  isReady: boolean;
  badgeLabel: "Проверено" | "Нужно перепроверить";
  badgeDescription: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  checkedAtLabel: string | null;
  issueLabel: string | null;
}

export interface CanonicalSizeStoreAction {
  href: string;
  analyticsPayload: {
    board_slug: string;
    placement: "board-page";
    size_cm: number;
    size_label: string;
    source_size_label: string | null;
    width_type: CanonicalSizeVariant["widthType"];
  };
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

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

function roleOrder(role: CanonicalFamilyMemberRole | null) {
  return role == null ? 3 : ROLE_ORDER[role];
}

function compareOffers(left: SourceOfferSummary, right: SourceOfferSummary) {
  return (
    roleOrder(left.memberRole) - roleOrder(right.memberRole) ||
    left.offerSlug.localeCompare(right.offerSlug, "en") ||
    left.offerId.localeCompare(right.offerId, "en")
  );
}

export function isCanonicalSizeCurrentlyAvailable(
  size: CanonicalSizeVariant,
) {
  return size.offerIsActive && size.isAvailable;
}

export function getCanonicalCurrentAvailableSizes(
  board: Pick<CanonicalCatalogItem, "sizes">,
) {
  return board.sizes.filter(isCanonicalSizeCurrentlyAvailable);
}

export function getCanonicalBoardAvailabilityHeadline(
  board: Pick<CanonicalCatalogItem, "sizes">,
) {
  const count = getCanonicalCurrentAvailableSizes(board).length;

  return count === 0
    ? "Сейчас нет доступных размеров"
    : `В наличии ${count} ${pluralizeSize(count)}`;
}

export function getCanonicalBoardAvailabilityDescription(
  board: Pick<CanonicalCatalogItem, "sizes">,
  limit = 5,
) {
  const labels = getCanonicalCurrentAvailableSizes(board)
    .map((size) => size.displaySizeLabel.trim())
    .filter(Boolean);

  if (labels.length === 0) {
    return "Доступные размеры в магазине сейчас не подтверждены.";
  }

  const preview = labels.slice(0, limit).join(", ");
  const remainder = labels.length - limit;

  return remainder > 0
    ? `Сейчас в наличии: ${preview} + ещё ${remainder}.`
    : `Сейчас в наличии: ${preview}.`;
}

export function getCanonicalBoardPricePresentation(
  price: number | null,
): CanonicalPricePresentation {
  return price != null && Number.isFinite(price) && price > 0
    ? { label: "Цена от", value: formatMoney(price) }
    : { label: "Цена", value: "Цена уточняется" };
}

export function getCanonicalBoardLineLabel(
  boardLine: CanonicalCatalogSpecs["boardLine"],
) {
  switch (boardLine) {
    case "men":
      return "Мужская";
    case "women":
      return "Женская";
    case "unisex":
      return "Унисекс";
    default:
      return "Уточняется";
  }
}

export function getCanonicalFlexPresentation(
  specs: CanonicalCatalogSpecs,
): CanonicalFlexPresentation {
  if (specs.flex == null || !Number.isFinite(specs.flex)) {
    return { value: "Уточняется", caption: null };
  }

  const sourceName = normalizeText(specs.sourceName);
  const sourceUrl = normalizeText(specs.sourceUrl);
  const trustedSourceKind =
    specs.canonicalSourceKind === "verified-official" ||
    specs.canonicalSourceKind === "manual" ||
    specs.canonicalSourceKind === "trusted-member";
  const safeSource = Boolean(
    sourceName && sourceUrl && !isStoreSpecificationSource(sourceUrl),
  );

  if (specs.dataStatus === "verified" && (trustedSourceKind || safeSource)) {
    return { value: `${specs.flex} из 10`, caption: null };
  }

  return {
    value: "Требует перепроверки",
    caption: FLEX_REVIEW_CAPTION,
  };
}

export function getCanonicalBoardTrustDetails(
  specs: CanonicalCatalogSpecs,
): CanonicalBoardTrustDetails {
  const sourceName = normalizeText(specs.sourceName);
  const sourceUrl = normalizeText(specs.sourceUrl);
  const checkedAtLabel = formatCatalogCheckedDate(specs.sourceCheckedAt);
  const issues: string[] = [];

  if (specs.dataStatus !== "verified") {
    issues.push("Характеристики модели ещё не отмечены как проверенные.");
  }
  if (!sourceName || !sourceUrl) {
    issues.push("Не указан источник характеристик.");
  }
  if (!specs.shapeType) {
    issues.push("Не указана форма / направленность доски.");
  }
  if (!specs.camberProfile) {
    issues.push("Не указан прогиб доски.");
  }

  const isReady = issues.length === 0;
  const issueLabel = issues[0] ?? null;

  return {
    isReady,
    badgeLabel: isReady ? "Проверено" : "Нужно перепроверить",
    badgeDescription: isReady
      ? checkedAtLabel
        ? `Характеристики модели отмечены как проверенные, последняя проверка ${checkedAtLabel}.`
        : "Характеристики модели отмечены как проверенные."
      : issueLabel ?? "Характеристики модели требуют ручной перепроверки.",
    sourceLabel: sourceName && sourceUrl ? sourceName : null,
    sourceUrl: sourceName && sourceUrl ? sourceUrl : null,
    checkedAtLabel,
    issueLabel: isReady ? null : issueLabel,
  };
}

export function getCanonicalNarrativeOfferSlug(
  board: Pick<CanonicalCatalogItem, "offers" | "defaultOfferSlug">,
) {
  const activeOffers = board.offers.filter((offer) => offer.isActive);
  const activeBase = activeOffers
    .filter((offer) => offer.memberRole === "base")
    .sort(compareOffers)[0];
  if (activeBase) {
    return activeBase.offerSlug;
  }

  const activeDefault = activeOffers.find(
    (offer) => offer.offerSlug === board.defaultOfferSlug,
  );
  if (activeDefault) {
    return activeDefault.offerSlug;
  }

  return [...activeOffers].sort(compareOffers)[0]?.offerSlug ?? null;
}

export function getCanonicalSizeStoreAction(
  boardSlug: string,
  size: CanonicalSizeVariant,
): CanonicalSizeStoreAction | null {
  if (!isCanonicalSizeCurrentlyAvailable(size)) {
    return null;
  }

  return {
    href: buildStoreRedirectHref(size.offerSlug, {
      from: "board-size",
      placement: "board-page",
      sizeCm: size.sizeCm,
      sizeLabel: size.displaySizeLabel,
      sourceSizeLabel: size.rawSizeLabel,
      widthType: size.widthType,
    }),
    analyticsPayload: {
      board_slug: boardSlug,
      placement: "board-page",
      size_cm: size.sizeCm,
      size_label: size.displaySizeLabel,
      source_size_label: size.rawSizeLabel,
      width_type: size.widthType,
    },
  };
}

export function getRelatedCanonicalBoards(
  current: CanonicalCatalogItem,
  allItems: readonly CanonicalCatalogItem[],
  limit = 3,
) {
  const currentStyle = current.canonicalSpecs.ridingStyle;
  const currentLine = current.canonicalSpecs.boardLine;

  if (!currentStyle && !currentLine) {
    return [];
  }

  return allItems
    .filter((candidate) => {
      if (candidate.slug === current.slug) {
        return false;
      }

      const sameStyle = Boolean(
        currentStyle && candidate.canonicalSpecs.ridingStyle === currentStyle,
      );
      const sameLine = Boolean(
        currentLine && candidate.canonicalSpecs.boardLine === currentLine,
      );
      return sameStyle || sameLine;
    })
    .sort((left, right) => {
      const leftSameStyle = Number(
        Boolean(currentStyle && left.canonicalSpecs.ridingStyle === currentStyle),
      );
      const rightSameStyle = Number(
        Boolean(currentStyle && right.canonicalSpecs.ridingStyle === currentStyle),
      );
      const leftSameLine = Number(
        Boolean(currentLine && left.canonicalSpecs.boardLine === currentLine),
      );
      const rightSameLine = Number(
        Boolean(currentLine && right.canonicalSpecs.boardLine === currentLine),
      );

      return (
        rightSameStyle - leftSameStyle ||
        rightSameLine - leftSameLine ||
        left.brand.localeCompare(right.brand, "ru") ||
        left.modelName.localeCompare(right.modelName, "ru") ||
        left.slug.localeCompare(right.slug, "ru")
      );
    })
    .slice(0, Math.max(0, limit));
}
