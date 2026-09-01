import type { RecommendationResult } from "@/types/domain";

export interface RecommendationTrustSummary {
  totalCount: number;
  readyCount: number;
  needsReviewCount: number;
  verifiedCount: number;
  latestCheckedAt: string | null;
  headline: string;
  description: string;
  reviewMessage: string;
}

function formatTrustDate(dateText: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateText}T00:00:00`));
}

export function buildRecommendationTrustSummary(
  recommendation: RecommendationResult,
): RecommendationTrustSummary {
  const totalCount = recommendation.recommendedBoards.length;
  const readyCount = recommendation.recommendedBoards.filter(
    (match) => match.isCatalogReady,
  ).length;
  const verifiedCount = recommendation.recommendedBoards.filter(
    (match) => match.product.dataStatus === "verified",
  ).length;
  const needsReviewCount = totalCount - readyCount;

  const checkedDates = recommendation.recommendedBoards
    .map((match) => match.product.sourceCheckedAt)
    .filter((dateText): dateText is string => Boolean(dateText))
    .sort();
  const latestCheckedAt = checkedDates.at(-1) ?? null;

  const headline =
    readyCount === totalCount
      ? "Основные характеристики указаны для всех моделей в подборке."
      : "Для части моделей некоторые характеристики пока уточняются.";

  const description = latestCheckedAt
    ? `Последняя дата обновления данных в подборке: ${formatTrustDate(latestCheckedAt)}.`
    : "Для части моделей дата обновления данных не указана.";

  const reviewMessage =
    needsReviewCount === 0
      ? "Перед покупкой сверь характеристики выбранной ростовки в магазине."
      : "Некоторые характеристики стоит уточнить перед покупкой.";

  return {
    totalCount,
    readyCount,
    needsReviewCount,
    verifiedCount,
    latestCheckedAt,
    headline,
    description,
    reviewMessage,
  };
}
