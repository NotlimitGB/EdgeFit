import {
  getProductCatalogIssues,
  hasCatalogSource,
  isReadyForCatalog,
} from "@/lib/catalog-readiness";
import type { Product } from "@/types/domain";

const russianDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export interface ProductTrustDetails {
  isReady: boolean;
  badgeLabel: string;
  badgeDescription: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  checkedAtLabel: string | null;
  issueLabel: string | null;
}

export function formatCatalogCheckedDate(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  const shortDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);

  if (shortDateMatch) {
    const [, year, month, day] = shortDateMatch;
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);

    if (!Number.isNaN(date.getTime())) {
      return russianDateFormatter.format(date);
    }
  }

  const parsedDate = new Date(trimmedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return trimmedValue;
  }

  return russianDateFormatter.format(parsedDate);
}

export function getProductTrustDetails(product: Product): ProductTrustDetails {
  const isReady = isReadyForCatalog(product);
  const issues = getProductCatalogIssues(product);
  const checkedAtLabel = formatCatalogCheckedDate(product.sourceCheckedAt);
  const sourceLabel = hasCatalogSource(product) ? product.sourceName?.trim() || null : null;
  const sourceUrl = product.sourceUrl?.trim() || null;
  const issueLabel = issues[0] ?? null;

  return {
    isReady,
    badgeLabel: isReady ? "Проверено" : "Нужно перепроверить",
    badgeDescription: isReady
      ? checkedAtLabel
        ? `Размеры и ссылка сверены, последняя проверка ${checkedAtLabel}.`
        : "Размеры и ссылка сверены по источнику."
      : issueLabel ?? "Карточка ещё требует ручной перепроверки.",
    sourceLabel,
    sourceUrl,
    checkedAtLabel,
    issueLabel: isReady ? null : issueLabel,
  };
}
