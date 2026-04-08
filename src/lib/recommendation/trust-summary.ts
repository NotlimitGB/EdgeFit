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
      ? `Все ${totalCount} модели в этой подборке уже проверены.`
      : `${readyCount} из ${totalCount} рекомендованных моделей уже проверены по источникам.`;

  const description = latestCheckedAt
    ? `Последняя сверка данных в этой подборке: ${formatTrustDate(latestCheckedAt)}.`
    : "Для части карточек ещё нет даты ручной сверки.";

  const reviewMessage =
    needsReviewCount === 0
      ? "Сейчас в выдаче нет карточек, которые требуют ручной перепроверки."
      : `${needsReviewCount} карточк${needsReviewCount === 1 ? "а ещё требует" : needsReviewCount < 5 ? "и ещё требуют" : " ещё требуют"} ручной перепроверки перед жёстким выбором.`;

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

