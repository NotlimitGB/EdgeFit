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
  "Пока нет подтверждённых данных о жёсткости этой модели.";

export interface CanonicalPricePresentation {
  label: "Ориентир цены";
  value: string;
}

export interface CanonicalFlexPresentation {
  value: string;
  caption: string | null;
}

export interface CanonicalBoardTrustDetails {
  isReady: boolean;
  badgeLabel:
    | "Основные характеристики указаны"
    | "Некоторые характеристики уточняются";
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

export interface CanonicalBoardPublicNarrative {
  intro: string;
  fullDescription: string | null;
  source: "stored" | "safe-fallback";
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

function normalizeNarrativeText(value: string | null | undefined) {
  return normalizeText(value)?.replace(/\s+/gu, " ") ?? null;
}

function hasAdjacentDuplicateWord(value: string) {
  const normalized = value.toLocaleLowerCase("ru-RU");
  return /(?:^|[^\p{L}\p{N}])([\p{L}\p{N}]+)\s+\1(?=$|[^\p{L}\p{N}])/u.test(
    normalized,
  );
}

function isUnsafeStoredNarrative(value: string) {
  const normalized = value.toLocaleLowerCase("ru-RU");

  return (
    /из\s+каталога/u.test(normalized) ||
    /в\s+карточке\s+магазина/u.test(normalized) ||
    /триал\s*[-–—]\s*спорт/u.test(normalized) ||
    /траектория/u.test(normalized) ||
    hasAdjacentDuplicateWord(normalized)
  );
}

function compareNarrativeSizes(
  left: CanonicalSizeVariant,
  right: CanonicalSizeVariant,
) {
  return (
    left.sizeCm - right.sizeCm ||
    left.displaySizeLabel.localeCompare(right.displaySizeLabel, "ru") ||
    left.sourceSizeId.localeCompare(right.sourceSizeId, "en")
  );
}

function formatSizeList(labels: readonly string[]) {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }

  return `${labels.slice(0, -1).join(", ")} и ${labels.at(-1)}`;
}

function formatSizeValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function getCanonicalNarrativeSizeCopy(
  sizes: readonly CanonicalSizeVariant[],
) {
  const seen = new Set<string>();
  const uniqueSizes = [...sizes]
    .sort(compareNarrativeSizes)
    .filter((size) => {
      const label = normalizeNarrativeText(size.displaySizeLabel);
      if (!label) {
        return false;
      }

      const key = label.replace(/\s+/gu, "").toLocaleLowerCase("ru-RU");
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  const labels = uniqueSizes.map(
    (size) => normalizeNarrativeText(size.displaySizeLabel)!,
  );

  if (labels.length === 0) {
    return null;
  }

  if (labels.length <= 3) {
    const unit = labels.every((label) => /^\d+(?:[.,]\d+)?$/u.test(label))
      ? " см"
      : "";
    const sizeLabel = formatSizeList(labels);

    return labels.length === 1
      ? `В EdgeFit зафиксирована ростовка модели ${sizeLabel}${unit}.`
      : `В EdgeFit зафиксированы ростовки модели ${sizeLabel}${unit}.`;
  }

  const numericSizes = uniqueSizes
    .map((size) => size.sizeCm)
    .filter((sizeCm) => Number.isFinite(sizeCm));
  const minimumSize = Math.min(...numericSizes);
  const maximumSize = Math.max(...numericSizes);

  if (
    numericSizes.length === uniqueSizes.length &&
    minimumSize < maximumSize
  ) {
    return `В EdgeFit зафиксирована размерная сетка модели от ${formatSizeValue(minimumSize)} до ${formatSizeValue(maximumSize)} см.`;
  }

  return `В EdgeFit зафиксированы ростовки модели ${formatSizeList(labels)}.`;
}

export function getCanonicalBoardPublicNarrative(
  board: Pick<
    CanonicalCatalogItem,
    "brand" | "modelName" | "seasonLabel" | "canonicalSpecs" | "sizes"
  >,
): CanonicalBoardPublicNarrative {
  const descriptionShort = normalizeNarrativeText(
    board.canonicalSpecs.descriptionShort,
  );
  const descriptionFull = normalizeNarrativeText(
    board.canonicalSpecs.descriptionFull,
  );
  const storedNarratives = [descriptionShort, descriptionFull].filter(
    (value): value is string => value != null,
  );
  const storedIntro = descriptionShort ?? descriptionFull;

  if (
    storedIntro &&
    storedNarratives.every((value) => !isUnsafeStoredNarrative(value))
  ) {
    return {
      intro: storedIntro,
      fullDescription:
        descriptionFull && descriptionFull !== storedIntro
          ? descriptionFull
          : null,
      source: "stored",
    };
  }

  const identity = [board.brand, board.modelName]
    .map((value) => normalizeNarrativeText(value))
    .filter((value): value is string => value != null)
    .join(" ");
  const seasonLabel = normalizeNarrativeText(board.seasonLabel);
  const identityCopy = seasonLabel
    ? `${identity}, сезон ${seasonLabel}.`
    : `${identity}.`;
  const sizeCopy = getCanonicalNarrativeSizeCopy(board.sizes);
  const actionCopy =
    "Подходящую ростовку можно проверить по своим параметрам.";

  return {
    intro: [identityCopy, sizeCopy, actionCopy].filter(Boolean).join(" "),
    fullDescription: null,
    source: "safe-fallback",
  };
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
    ? "Доступность не подтверждена"
    : `В данных EdgeFit отмечено: ${count} ${pluralizeSize(count)}`;
}

export function getCanonicalBoardAvailabilityDescription(
  board: Pick<CanonicalCatalogItem, "sizes">,
  limit = 5,
) {
  const labels = getCanonicalCurrentAvailableSizes(board)
    .map((size) => size.displaySizeLabel.trim())
    .filter(Boolean);

  if (labels.length === 0) {
    return "Актуальную доступность проверяй в магазине.";
  }

  const preview = labels.slice(0, limit).join(", ");
  const remainder = labels.length - limit;

  return remainder > 0
    ? `Отмеченные размеры: ${preview} + ещё ${remainder}. Актуальную доступность проверяй в магазине.`
    : `Отмеченные размеры: ${preview}. Актуальную доступность проверяй в магазине.`;
}

export function getCanonicalSizeAvailabilityLabel(
  size: CanonicalSizeVariant,
) {
  return isCanonicalSizeCurrentlyAvailable(size)
    ? "отмечен доступным"
    : "доступность не подтверждена";
}

export function getCanonicalBoardPricePresentation(
  price: number | null,
): CanonicalPricePresentation {
  return price != null && Number.isFinite(price) && price > 0
    ? { label: "Ориентир цены", value: formatMoney(price) }
    : { label: "Ориентир цены", value: "нет данных" };
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
    value: "Уточняется",
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
    issues.push("Некоторые характеристики пока уточняются.");
  }
  if (!sourceName || !sourceUrl) {
    issues.push("Источник характеристик пока не указан.");
  }
  if (!specs.shapeType) {
    issues.push("Форма доски пока не указана.");
  }
  if (!specs.camberProfile) {
    issues.push("Прогиб пока не указан.");
  }

  const isReady = issues.length === 0;
  const issueLabel = issues[0] ?? null;

  return {
    isReady,
    badgeLabel: isReady
      ? "Основные характеристики указаны"
      : "Некоторые характеристики уточняются",
    badgeDescription: isReady
      ? checkedAtLabel
        ? `Основные характеристики указаны. Данные обновлены ${checkedAtLabel}.`
        : "Основные характеристики указаны."
      : issueLabel ?? "Некоторые характеристики пока уточняются.",
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
