import { getBoardSizeLabel } from "@/lib/board-size";
import { boardShapeLabels } from "@/lib/content";
import type {
  RecommendationMatch,
  RecommendationResult,
  RecommendationRole,
} from "@/types/domain";

export interface RecommendationComparisonItem {
  rank: number;
  title: string;
  sizeLabel: string;
  roleLabel: string;
  summary: string;
  highlights: string[];
}

const roleLabels: Record<RecommendationRole, string> = {
  "best-overall": "лучший общий вариант",
  playful: "более живой вариант",
  stable: "более стабильный вариант",
  "width-safe": "больше запаса по ширине",
};

const ridingStyleLabels = {
  "all-mountain": "универсальное катание",
  park: "фристайл и парк",
  freeride: "трасса и мягкий снег",
} as const;

function buildRoleSummary(match: RecommendationMatch) {
  switch (match.role) {
    case "playful":
      return "Лучше подойдёт, если хочется манёвреннее и живее ощущение доски.";
    case "stable":
      return "Лучше подойдёт, если важнее стабильность на скорости и уверенность в дуге.";
    case "width-safe":
      return "Лучше подойдёт, если хочется максимального запаса под ботинок и спокойствия по ширине.";
    default:
      return "Самый ровный и универсальный вариант без явного перекоса в одну сторону.";
  }
}

function buildLengthHighlight(
  match: RecommendationMatch,
  recommendation: RecommendationResult,
) {
  const sizeCm = match.size.sizeCm;

  if (sizeCm <= recommendation.lengthRange.min + 1) {
    return "По длине это ближе к нижней границе диапазона: доска будет живее в перекантовке.";
  }

  if (sizeCm >= recommendation.lengthRange.max - 1) {
    return "По длине это ближе к верхней границе диапазона: больше стабильности и запаса на скорости.";
  }

  return "По длине это центральный вариант: наиболее нейтральный баланс между манёвренностью и стабильностью.";
}

function buildWidthHighlight(
  match: RecommendationMatch,
  recommendation: RecommendationResult,
) {
  const widthDelta = match.size.waistWidthMm - recommendation.targetWaistWidthMm;

  if (widthDelta >= 4) {
    return `Талия ${match.size.waistWidthMm} мм даёт заметный запас относительно целевой ширины ${recommendation.targetWaistWidthMm} мм.`;
  }

  if (widthDelta >= 1) {
    return `Талия ${match.size.waistWidthMm} мм даёт небольшой запас относительно целевой ширины ${recommendation.targetWaistWidthMm} мм.`;
  }

  if (widthDelta >= 0) {
    return `Талия ${match.size.waistWidthMm} мм почти точно попадает в целевую ширину ${recommendation.targetWaistWidthMm} мм.`;
  }

  return `Талия ${match.size.waistWidthMm} мм чуть уже целевой ширины ${recommendation.targetWaistWidthMm} мм, поэтому вариант ближе к границе.`;
}

function buildStyleHighlight(
  match: RecommendationMatch,
  recommendation: RecommendationResult,
) {
  if (match.product.ridingStyle === recommendation.input.ridingStyle) {
    return `По характеру доска хорошо совпадает с вашим сценарием: ${ridingStyleLabels[recommendation.input.ridingStyle]}.`;
  }

  if (match.product.ridingStyle === "all-mountain") {
    return "По характеру это более универсальный вариант без узкой специализации.";
  }

  if (recommendation.input.ridingStyle === "all-mountain") {
    return `По характеру доска чуть сильнее смещена в сценарий "${ridingStyleLabels[match.product.ridingStyle]}".`;
  }

  return `По характеру это компромиссный вариант между вашим сценарием и акцентом на "${ridingStyleLabels[match.product.ridingStyle]}".`;
}

function buildTrustHighlight(match: RecommendationMatch) {
  if (match.isCatalogReady) {
    return "Карточка проверена: характеристики сверены с источником, и ссылка на модель живая.";
  }

  return "Карточка полезна как ориентир, но её ещё стоит вручную перепроверить перед жёстким выбором.";
}

function buildShapeHighlight(
  match: RecommendationMatch,
  recommendation: RecommendationResult,
) {
  const shapeType = match.product.shapeType;

  if (!shapeType) {
    return "Форма доски у этой карточки пока не уточнена, поэтому здесь меньше прозрачности именно по шейпу.";
  }

  if (shapeType === recommendation.shapeProfile.primary) {
    return `По форме это точное попадание: ${boardShapeLabels[shapeType]} — базовый ориентир для вашего сценария.`;
  }

  if (recommendation.shapeProfile.alternatives.includes(shapeType)) {
    return `По форме это рабочий компромисс: ${boardShapeLabels[shapeType]} остаётся в хорошей зоне для вашего сценария.`;
  }

  return `По форме доска смещена в сторону "${boardShapeLabels[shapeType]}", поэтому здесь больше компромисса относительно приоритетного сценария.`;
}

export function buildRecommendationComparison(
  recommendation: RecommendationResult,
): RecommendationComparisonItem[] {
  return recommendation.recommendedBoards.slice(0, 3).map((match, index) => ({
    rank: index + 1,
    title: `${match.product.brand} ${match.product.modelName}`,
    sizeLabel: getBoardSizeLabel(match.size),
    roleLabel: roleLabels[match.role],
    summary: buildRoleSummary(match),
    highlights: [
      buildLengthHighlight(match, recommendation),
      buildWidthHighlight(match, recommendation),
      buildStyleHighlight(match, recommendation),
      buildShapeHighlight(match, recommendation),
      buildTrustHighlight(match),
    ],
  }));
}
