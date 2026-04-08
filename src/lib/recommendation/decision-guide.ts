import { getBoardSizeLabel } from "@/lib/board-size";
import { widthTypeLabels } from "@/lib/content";
import type {
  RecommendationMatch,
  RecommendationResult,
} from "@/types/domain";

export interface RecommendationDecisionItem {
  id: "steady-choice" | "width-choice" | "playful-choice";
  title: string;
  summary: string;
  boardTitle: string;
  boardSlug: string;
  affiliateUrl: string;
  sizeLabel: string;
  highlight: string;
}

function pickUniqueMatch(
  recommendedBoards: RecommendationMatch[],
  usedSlugs: Set<string>,
  candidates: RecommendationMatch[],
) {
  const uniqueCandidate = candidates.find(
    (match) => !usedSlugs.has(match.product.slug),
  );

  if (uniqueCandidate) {
    usedSlugs.add(uniqueCandidate.product.slug);
    return uniqueCandidate;
  }

  const fallback = recommendedBoards.find(
    (match) => !usedSlugs.has(match.product.slug),
  );

  if (fallback) {
    usedSlugs.add(fallback.product.slug);
    return fallback;
  }

  return recommendedBoards[0];
}

function sortByScoreDescending(matches: RecommendationMatch[]) {
  return [...matches].sort((left, right) => right.score - left.score);
}

function sortBySmallestSize(matches: RecommendationMatch[]) {
  return [...matches].sort((left, right) => left.size.sizeCm - right.size.sizeCm);
}

function sortByLargestWaist(matches: RecommendationMatch[]) {
  return [...matches].sort(
    (left, right) => right.size.waistWidthMm - left.size.waistWidthMm,
  );
}

function buildBoardTitle(match: RecommendationMatch) {
  return `${match.product.brand} ${match.product.modelName}`;
}

function buildDecisionItem(
  item: Omit<RecommendationDecisionItem, "boardTitle" | "boardSlug" | "affiliateUrl" | "sizeLabel">,
  match: RecommendationMatch,
): RecommendationDecisionItem {
  return {
    ...item,
    boardTitle: buildBoardTitle(match),
    boardSlug: match.product.slug,
    affiliateUrl: match.product.affiliateUrl,
    sizeLabel: getBoardSizeLabel(match.size),
  };
}

function buildSteadyChoice(
  recommendation: RecommendationResult,
  usedSlugs: Set<string>,
): RecommendationDecisionItem {
  const candidates = sortByScoreDescending(
    recommendation.recommendedBoards.filter(
      (match) => match.role === "best-overall" || match.role === "stable",
    ),
  );
  const match = pickUniqueMatch(
    recommendation.recommendedBoards,
    usedSlugs,
    candidates,
  );

  return buildDecisionItem(
    {
      id: "steady-choice",
      title: "Если хочется поспокойнее",
      summary:
        "Этот вариант стоит брать, если хочется меньше сомнений и более ровного ощущения доски без резкого перекоса в одну крайность.",
      highlight:
        match.role === "stable"
          ? "Он ближе к стабильной стороне диапазона и лучше держит запас на скорости."
          : "Он дает самый нейтральный баланс между маневренностью, стабильностью и универсальностью.",
    },
    match,
  );
}

function buildWidthChoice(
  recommendation: RecommendationResult,
  usedSlugs: Set<string>,
): RecommendationDecisionItem {
  const candidates = sortByLargestWaist(
    recommendation.recommendedBoards.filter(
      (match) =>
        match.role === "width-safe" ||
        match.size.widthType === recommendation.recommendedWidthType,
    ),
  );
  const match = pickUniqueMatch(
    recommendation.recommendedBoards,
    usedSlugs,
    candidates,
  );

  return buildDecisionItem(
    {
      id: "width-choice",
      title: "Если больше всего волнует ширина",
      summary:
        "Этот вариант полезнее смотреть первым, если главный страх сейчас - зацеп ботинком или слишком пограничная талия.",
      highlight: `У этого размера талия ${match.size.waistWidthMm} мм и категория ${widthTypeLabels[match.size.widthType]}, что дает больше спокойствия относительно целевой ширины ${recommendation.targetWaistWidthMm} мм.`,
    },
    match,
  );
}

function buildPlayfulChoice(
  recommendation: RecommendationResult,
  usedSlugs: Set<string>,
): RecommendationDecisionItem {
  const candidates = sortBySmallestSize(
    recommendation.recommendedBoards.filter(
      (match) =>
        match.role === "playful" || match.product.ridingStyle === "park",
    ),
  );
  const match = pickUniqueMatch(
    recommendation.recommendedBoards,
    usedSlugs,
    candidates,
  );

  return buildDecisionItem(
    {
      id: "playful-choice",
      title: "Если хочется доску поживее",
      summary:
        "Этот вариант логичнее, если хочется легче перекантовываться, быстрее разворачивать доску и чувствовать меньше тяжести под ногами.",
      highlight:
        match.role === "playful"
          ? "Он ближе к более живой части диапазона и дает меньше инерции в повороте."
          : "Из сильных вариантов он ощущается живее и легче, чем более стабильные альтернативы.",
    },
    match,
  );
}

export function buildRecommendationDecisionGuide(
  recommendation: RecommendationResult,
): RecommendationDecisionItem[] {
  if (recommendation.recommendedBoards.length === 0) {
    return [];
  }

  const usedSlugs = new Set<string>();

  return [
    buildSteadyChoice(recommendation, usedSlugs),
    buildWidthChoice(recommendation, usedSlugs),
    buildPlayfulChoice(recommendation, usedSlugs),
  ];
}
