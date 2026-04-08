import {
  hasPlaceholderAffiliateLink,
  isReadyForCatalog,
  isVerifiedProduct,
} from "@/lib/catalog-readiness";
import {
  aggressivenessLabels,
  boardLineLabels,
  boardShapeLabels,
  bootDragRiskLabels,
  ridingStyleLabels,
  skillLevelLabels,
  stanceLabels,
  widthTypeDescriptions,
  widthTypeLabels,
} from "@/lib/content";
import { получитьДемоМодели } from "@/lib/demo-products";
import {
  buildTerrainPriorityExplanation,
  getRecommendationShapeProfile,
  getShapeCompatibility,
  getTerrainPriorityLengthAdjustment,
} from "@/lib/recommendation/shape-profile";
import { getRecommendedWeightMaxValue } from "@/lib/weight-range";
import type {
  BootDragRisk,
  Product,
  ProductSize,
  QuizInput,
  RecommendationConfidence,
  RecommendationMatch,
  RecommendationRole,
  RecommendationResult,
  WidthType,
} from "@/types/domain";

export const ВЕРСИЯ_АЛГОРИТМА = "v1.3.0";

const WEIGHT_LENGTH_RULES = [
  { min: 35, max: 44.99, range: { min: 138, max: 142 } },
  { min: 45, max: 54.99, range: { min: 142, max: 147 } },
  { min: 55, max: 64.99, range: { min: 147, max: 152 } },
  { min: 65, max: 74.99, range: { min: 152, max: 156 } },
  { min: 75, max: 84.99, range: { min: 155, max: 159 } },
  { min: 85, max: 94.99, range: { min: 158, max: 162 } },
  { min: 95, max: 150, range: { min: 161, max: 166 } },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getWeightLengthRange(weightKg: number) {
  return (
    WEIGHT_LENGTH_RULES.find(
      (rule) => weightKg >= rule.min && weightKg <= rule.max,
    )?.range ?? { min: 152, max: 156 }
  );
}

function getHeightAdjustment(heightCm: number) {
  if (heightCm <= 160) {
    return -1;
  }

  if (heightCm >= 186) {
    return 2;
  }

  if (heightCm >= 179) {
    return 1;
  }

  return 0;
}

function getStyleAdjustment(ridingStyle: QuizInput["ridingStyle"]) {
  switch (ridingStyle) {
    case "park":
      return { min: -2, max: -1 };
    case "freeride":
      return { min: 1, max: 3 };
    default:
      return { min: 0, max: 0 };
  }
}

function getAggressivenessAdjustment(
  aggressiveness: QuizInput["aggressiveness"],
) {
  switch (aggressiveness) {
    case "relaxed":
      return { min: -1, max: 0 };
    case "aggressive":
      return { min: 1, max: 1 };
    default:
      return { min: 0, max: 0 };
  }
}

function getWidthRecommendation(
  bootSizeEu: number,
  stanceType: QuizInput["stanceType"],
) {
  let recommendedWidthType: WidthType = "regular";
  let targetWaistWidthMm = 250;

  if (bootSizeEu >= 45.5) {
    recommendedWidthType = "wide";
    targetWaistWidthMm = 262;
  } else if (bootSizeEu >= 43.5) {
    recommendedWidthType = "mid-wide";
    targetWaistWidthMm = 257;
  }

  if (stanceType === "duck") {
    targetWaistWidthMm -= 2;
  }

  if (stanceType === "unknown" && bootSizeEu >= 43.5) {
    targetWaistWidthMm += 1;
  }

  return {
    recommendedWidthType,
    targetWaistWidthMm,
  };
}

function getBootDragRisk(
  bootSizeEu: number,
  stanceType: QuizInput["stanceType"],
  recommendedWidthType: WidthType,
): BootDragRisk {
  let score = 0;

  if (bootSizeEu >= 45.5) {
    score += 2;
  } else if (bootSizeEu >= 43.5) {
    score += 1;
  }

  if (stanceType === "unknown") {
    score += 1;
  }

  if (stanceType === "duck" && score > 0) {
    score -= 1;
  }

  if (recommendedWidthType === "wide" && score > 0) {
    score -= 1;
  }

  if (score <= 0) {
    return "low";
  }

  if (score === 1) {
    return "medium";
  }

  return "high";
}

function getSkillCompatibility(
  boardSkill: Product["skillLevel"],
  userSkill: QuizInput["skillLevel"],
) {
  const order = ["beginner", "intermediate", "advanced"] as const;
  const boardIndex = order.indexOf(boardSkill);
  const userIndex = order.indexOf(userSkill);

  if (boardIndex === userIndex) {
    return 16;
  }

  if (Math.abs(boardIndex - userIndex) === 1) {
    return 10;
  }

  return -10;
}

function getBoardLineCompatibility(
  board: Product,
  preference: QuizInput["boardLinePreference"],
) {
  if (preference === "any") {
    return 0;
  }

  if (board.boardLine === "unisex") {
    return 6;
  }

  return board.boardLine === preference ? 10 : -12;
}

function getStyleCompatibility(
  boardStyle: Product["ridingStyle"],
  userStyle: QuizInput["ridingStyle"],
) {
  if (boardStyle === userStyle) {
    return 18;
  }

  if (boardStyle === "all-mountain" || userStyle === "all-mountain") {
    return 9;
  }

  return -10;
}

function getRecommendationRole(
  sizeCm: number,
  min: number,
  max: number,
  widthDelta: number,
): { role: RecommendationRole; fitLabel: string } {
  if (widthDelta >= 4) {
    return {
      role: "width-safe",
      fitLabel: "больше запаса по ширине",
    };
  }

  if (sizeCm <= min + 1) {
    return {
      role: "playful",
      fitLabel: "более игривый вариант",
    };
  }

  if (sizeCm >= max - 1) {
    return {
      role: "stable",
      fitLabel: "более стабильный вариант",
    };
  }

  return {
    role: "best-overall",
    fitLabel: "лучший общий вариант",
  };
}

function getRecommendationConfidence(
  score: number,
  isCatalogReadyFlag: boolean,
): {
  confidence: RecommendationConfidence;
  confidenceLabel: string;
} {
  if (score >= 72 && isCatalogReadyFlag) {
    return {
      confidence: "high",
      confidenceLabel: "Высокая уверенность в совпадении.",
    };
  }

  if (score >= 58) {
    return {
      confidence: "medium",
      confidenceLabel: "Хорошее совпадение по ключевым параметрам.",
    };
  }

  return {
    confidence: "careful",
    confidenceLabel: "Пограничный вариант, который стоит перепроверить.",
  };
}

function scoreCandidate(
  product: Product,
  size: ProductSize,
  input: QuizInput,
  lengthRange: { min: number; max: number },
  targetWaistWidthMm: number,
  shapeProfile: ReturnType<typeof getRecommendationShapeProfile>,
) {
  let score = 0;
  const reasons: string[] = [];
  const widthDelta = size.waistWidthMm - targetWaistWidthMm;
  const weightMax = getRecommendedWeightMaxValue(size);
  const hasWeightData =
    size.recommendedWeightMin > 0 || size.recommendedWeightMax != null;
  const catalogReady = isReadyForCatalog(product);
  const verifiedProduct = isVerifiedProduct(product);

  if (size.sizeCm >= lengthRange.min && size.sizeCm <= lengthRange.max) {
    score += 28;
    reasons.push("Размер попадает в ваш рабочий диапазон длины.");
  } else if (
    size.sizeCm >= lengthRange.min - 2 &&
    size.sizeCm <= lengthRange.max + 2
  ) {
    score += 12;
    reasons.push("Размер рядом с целевым диапазоном и может подойти под стиль.");
  } else {
    score -= 12;
  }

  if (hasWeightData) {
    if (
      input.weightKg >= size.recommendedWeightMin &&
      input.weightKg <= weightMax
    ) {
      score += 22;
      reasons.push("Вес попадает в диапазон, на который рассчитан этот размер.");
    } else if (
      input.weightKg >= size.recommendedWeightMin - 5 &&
      input.weightKg <= weightMax + 5
    ) {
      score += 8;
    } else {
      score -= 8;
    }
  } else {
    score -= 4;
  }

  const styleScore = getStyleCompatibility(product.ridingStyle, input.ridingStyle);
  score += styleScore;
  if (styleScore > 0) {
    reasons.push("Характер доски совпадает с вашим стилем катания.");
  }

  const shapeCompatibility = getShapeCompatibility(product.shapeType, shapeProfile);
  score += shapeCompatibility.score;
  if (shapeCompatibility.score > 0) {
    reasons.push(shapeCompatibility.reason);
  }

  const skillScore = getSkillCompatibility(product.skillLevel, input.skillLevel);
  score += skillScore;
  if (skillScore > 0) {
    reasons.push("Жесткость и характер доски подходят вашему уровню.");
  }

  score += getBoardLineCompatibility(product, input.boardLinePreference);

  if (widthDelta >= 0) {
    score += 18;
    reasons.push("Ширины хватает под ваш размер ботинка.");
  } else if (widthDelta >= -3) {
    score += 6;
  } else {
    score -= 24;
    reasons.push("Ширина может быть пограничной для вашего ботинка.");
  }

  if (product.ridingStyle === "park" && input.aggressiveness === "relaxed") {
    score += 4;
  }

  if (
    product.ridingStyle === "freeride" &&
    input.aggressiveness === "aggressive"
  ) {
    score += 4;
  }

  if (catalogReady) {
    score += 10;
  } else if (verifiedProduct) {
    score += 4;
  }

  if (hasPlaceholderAffiliateLink(product)) {
    score -= 12;
  }

  const role = getRecommendationRole(
    size.sizeCm,
    lengthRange.min,
    lengthRange.max,
    widthDelta,
  );
  const confidence = getRecommendationConfidence(score, catalogReady);

  return {
    product,
    size,
    score,
    fitLabel: role.fitLabel,
    role: role.role,
    confidence: confidence.confidence,
    confidenceLabel: confidence.confidenceLabel,
    isCatalogReady: catalogReady,
    reasons: reasons.slice(0, 3),
  } satisfies RecommendationMatch;
}

function getCandidates(
  boards: Product[],
  input: QuizInput,
  lengthRange: { min: number; max: number },
  targetWaistWidthMm: number,
  shapeProfile: ReturnType<typeof getRecommendationShapeProfile>,
) {
  const bestPerBoard = boards.flatMap((product) => {
    if (product.sizes.length === 0) {
      return [];
    }

    const matches = product.sizes.map((size) =>
      scoreCandidate(
        product,
        size,
        input,
        lengthRange,
        targetWaistWidthMm,
        shapeProfile,
      ),
    );

    const bestMatch = matches.sort((left, right) => right.score - left.score)[0];

    return bestMatch ? [bestMatch] : [];
  });

  const sortedBoards = bestPerBoard.sort((left, right) => right.score - left.score);
  let recommendedBoards = sortedBoards
    .filter((match) => match.score >= 52)
    .slice(0, 4);

  if (recommendedBoards.length < 3) {
    recommendedBoards = sortedBoards.slice(0, Math.min(4, sortedBoards.length));
  }

  const recommendedKeys = new Set(
    recommendedBoards.map((match) => `${match.product.id}-${match.size.sizeCm}`),
  );

  const avoidBoards = sortedBoards
    .filter((match) => !recommendedKeys.has(`${match.product.id}-${match.size.sizeCm}`))
    .sort((left, right) => left.score - right.score)
    .slice(0, 3);

  return {
    recommendedBoards,
    avoidBoards,
  };
}

function buildExplanation(
  input: QuizInput,
  lengthRange: { min: number; max: number },
  weightRange: { min: number; max: number },
  recommendedWidthType: WidthType,
  shapeProfile: ReturnType<typeof getRecommendationShapeProfile>,
  targetWaistWidthMm: number,
  bootDragRisk: BootDragRisk,
) {
  return [
    `Вес ${input.weightKg} кг даёт базовый диапазон ${weightRange.min}-${weightRange.max} см. Дальше мы мягко подправили его под рост ${input.heightCm} см, стиль ${ridingStyleLabels[input.ridingStyle]} и ваш ${aggressivenessLabels[input.aggressiveness]} темп катания.`,
    `Итоговый диапазон ${lengthRange.min}-${lengthRange.max} см подходит под сценарий "${ridingStyleLabels[input.ridingStyle]}": он не будет слишком коротким для стабильности и не станет лишне требовательным.`,
    buildTerrainPriorityExplanation(input.terrainPriority),
    `Размер ботинка EU ${input.bootSizeEu} и ${stanceLabels[input.stanceType]} выводят вас в категорию ${widthTypeLabels[recommendedWidthType]}. Мы ориентируемся на целевую талию около ${targetWaistWidthMm} мм. ${widthTypeDescriptions[recommendedWidthType]}`,
    `${shapeProfile.headline} Базовый ориентир здесь — ${boardShapeLabels[shapeProfile.primary]}. ${shapeProfile.description}`,
    `Риск boot drag сейчас оценивается как ${bootDragRiskLabels[bootDragRisk]}. Это не абсолютный приговор, а понятная подсказка: при выборе доски уже видно, где ширина безопасна, а где лучше не рисковать.`,
    `В подборе мы дополнительно учитываем линию ${boardLineLabels[input.boardLinePreference]} и уровень ${skillLevelLabels[input.skillLevel]}, а в выдаче выше ставим проверенные карточки с живыми ссылками, чтобы рекомендации выглядели надёжнее.`,
  ];
}

export function getRecommendation(
  input: QuizInput,
  boards: Product[] = получитьДемоМодели(),
): RecommendationResult {
  const activeBoards = boards.filter(
    (board) => board.isActive && board.sizes.length > 0,
  );
  const verifiedBoards = activeBoards.filter(
    (board) => board.dataStatus === "verified",
  );
  const candidateBoards =
    verifiedBoards.length >= 3 ? verifiedBoards : activeBoards;
  const weightRange = getWeightLengthRange(input.weightKg);
  const heightAdjustment = getHeightAdjustment(input.heightCm);
  const styleAdjustment = getStyleAdjustment(input.ridingStyle);
  const terrainPriorityAdjustment = getTerrainPriorityLengthAdjustment(
    input.terrainPriority,
  );
  const aggressivenessAdjustment = getAggressivenessAdjustment(
    input.aggressiveness,
  );

  const lengthRange = {
    min: clamp(
      weightRange.min +
        heightAdjustment +
        styleAdjustment.min +
        terrainPriorityAdjustment.min +
        aggressivenessAdjustment.min,
      138,
      166,
    ),
    max: clamp(
      weightRange.max +
        heightAdjustment +
        styleAdjustment.max +
        terrainPriorityAdjustment.max +
        aggressivenessAdjustment.max,
      141,
      168,
    ),
  };

  if (lengthRange.max - lengthRange.min < 2) {
    lengthRange.max = lengthRange.min + 2;
  }

  const widthRecommendation = getWidthRecommendation(
    input.bootSizeEu,
    input.stanceType,
  );
  const shapeProfile = getRecommendationShapeProfile(input);
  const bootDragRisk = getBootDragRisk(
    input.bootSizeEu,
    input.stanceType,
    widthRecommendation.recommendedWidthType,
  );
  const candidates = getCandidates(
    candidateBoards,
    input,
    lengthRange,
    widthRecommendation.targetWaistWidthMm,
    shapeProfile,
  );

  return {
    algorithmVersion: ВЕРСИЯ_АЛГОРИТМА,
    input,
    lengthRange,
    recommendedWidthType: widthRecommendation.recommendedWidthType,
    shapeProfile,
    targetWaistWidthMm: widthRecommendation.targetWaistWidthMm,
    bootDragRisk,
    explanation: buildExplanation(
      input,
      lengthRange,
      weightRange,
      widthRecommendation.recommendedWidthType,
      shapeProfile,
      widthRecommendation.targetWaistWidthMm,
      bootDragRisk,
    ),
    recommendedBoards: candidates.recommendedBoards,
    avoidBoards: candidates.avoidBoards,
  };
}
