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
import boardsSeed from "@/data/seed/boards.seed.json";
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

export const ALGORITHM_VERSION = "v1.4.0";

function getDemoProducts() {
  return (boardsSeed as Product[])
    .filter((product) => product.isActive)
    .map((product) => ({
      ...product,
      shapeType: product.shapeType ?? null,
      dataStatus: product.dataStatus ?? "draft",
      sourceName: product.sourceName?.trim() || null,
      sourceUrl: product.sourceUrl?.trim() || null,
      sourceCheckedAt: product.sourceCheckedAt || null,
      sizes: product.sizes.map((size) => ({
        ...size,
        sizeLabel: size.sizeLabel?.trim() || null,
        isAvailable: size.isAvailable !== false,
      })),
    }));
}

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

function roundScore(value: number) {
  return Math.round(value);
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
  input: QuizInput,
) {
  if (boardStyle === input.ridingStyle) {
    return 18;
  }

  if (input.ridingStyle === "all-mountain") {
    if (
      input.terrainPriority === "switch-freestyle" &&
      boardStyle === "park"
    ) {
      return 4;
    }

    if (
      (input.terrainPriority === "soft-snow" ||
        input.terrainPriority === "groomers-carving") &&
      boardStyle === "freeride"
    ) {
      return 3;
    }

    return -8;
  }

  if (boardStyle === "all-mountain") {
    return 8;
  }

  return -12;
}

function getPreferredBoardStyles(input: QuizInput) {
  if (input.ridingStyle === "all-mountain") {
    switch (input.terrainPriority) {
      case "switch-freestyle":
        return ["all-mountain", "park"] satisfies Product["ridingStyle"][];
      case "groomers-carving":
      case "soft-snow":
        return ["all-mountain", "freeride"] satisfies Product["ridingStyle"][];
      default:
        return ["all-mountain"] satisfies Product["ridingStyle"][];
    }
  }

  if (input.ridingStyle === "park") {
    return ["park", "all-mountain"] satisfies Product["ridingStyle"][];
  }

  return ["freeride", "all-mountain"] satisfies Product["ridingStyle"][];
}

function getStyleFocusedBoards(boards: Product[], input: QuizInput) {
  const preferredStyles = new Set(getPreferredBoardStyles(input));
  const focusedBoards = boards.filter((board) =>
    preferredStyles.has(board.ridingStyle),
  );

  return focusedBoards.length >= 3 ? focusedBoards : boards;
}

function getLengthTarget(
  lengthRange: { min: number; max: number },
  input: QuizInput,
) {
  let target = (lengthRange.min + lengthRange.max) / 2;

  if (input.ridingStyle === "park") {
    target -= 0.5;
  }

  if (input.ridingStyle === "freeride") {
    target += 0.75;
  }

  switch (input.terrainPriority) {
    case "switch-freestyle":
      target -= 0.5;
      break;
    case "groomers-carving":
      target += 0.25;
      break;
    case "soft-snow":
      target += 0.75;
      break;
    default:
      break;
  }

  if (input.aggressiveness === "relaxed") {
    target -= 0.25;
  }

  if (input.aggressiveness === "aggressive") {
    target += 0.25;
  }

  return clamp(target, lengthRange.min, lengthRange.max);
}

function getLengthCompatibility(
  sizeCm: number,
  lengthRange: { min: number; max: number },
  input: QuizInput,
) {
  const target = getLengthTarget(lengthRange, input);
  const halfRange = Math.max((lengthRange.max - lengthRange.min) / 2, 1.5);
  const insideRange =
    sizeCm >= lengthRange.min && sizeCm <= lengthRange.max;

  if (insideRange) {
    const distance = Math.abs(sizeCm - target);
    const closeness = clamp(1 - distance / (halfRange + 0.75), 0, 1);
    const score = roundScore(20 + closeness * 16);

    if (distance <= 0.75) {
      return {
        score,
        reason:
          "Размер попадает не просто в диапазон, а близко к идеальной длине под ваш сценарий.",
        target,
      };
    }

    if (sizeCm < target) {
      return {
        score,
        reason:
          "Размер остаётся внутри диапазона и даёт чуть более живое, манёвренное ощущение.",
        target,
      };
    }

    return {
      score,
      reason:
        "Размер остаётся внутри диапазона и даёт чуть больше запаса по стабильности.",
      target,
    };
  }

  const distanceToRange = Math.min(
    Math.abs(sizeCm - lengthRange.min),
    Math.abs(sizeCm - lengthRange.max),
  );

  if (distanceToRange <= 2.5) {
    return {
      score: roundScore(10 - distanceToRange * 2),
      reason:
        "Размер рядом с целевым диапазоном и может подойти, если вам нужен небольшой сдвиг по ощущениям.",
      target,
    };
  }

  return {
    score: -14,
    reason: null,
    target,
  };
}

function getWeightCompatibility(size: ProductSize, weightKg: number) {
  const weightMax = getRecommendedWeightMaxValue(size);
  const hasWeightData =
    size.recommendedWeightMin > 0 || size.recommendedWeightMax != null;

  if (!hasWeightData) {
    return {
      score: -4,
      reason: null,
    };
  }

  if (weightKg >= size.recommendedWeightMin && weightKg <= weightMax) {
    const idealWeight =
      size.recommendedWeightMax == null
        ? size.recommendedWeightMin + 8
        : (size.recommendedWeightMin + size.recommendedWeightMax) / 2;
    const tolerance =
      size.recommendedWeightMax == null
        ? 12
        : Math.max((size.recommendedWeightMax - size.recommendedWeightMin) / 2, 8);
    const distance = Math.abs(weightKg - idealWeight);
    const closeness = clamp(1 - distance / tolerance, 0, 1);

    return {
      score: roundScore(14 + closeness * 10),
      reason:
        "Вес попадает в рабочий диапазон именно этого размера, поэтому доска не должна ощущаться случайной.",
    };
  }

  if (
    weightKg >= size.recommendedWeightMin - 5 &&
    weightKg <= weightMax + 5
  ) {
    return {
      score: 6,
      reason: null,
    };
  }

  return {
    score: -8,
    reason: null,
  };
}

function getFlexPreferenceRange(input: QuizInput) {
  let min = 4;
  let max = 6;

  switch (input.skillLevel) {
    case "beginner":
      min -= 2;
      max -= 1;
      break;
    case "advanced":
      min += 1;
      max += 2;
      break;
    default:
      break;
  }

  if (
    input.ridingStyle === "park" ||
    input.terrainPriority === "switch-freestyle"
  ) {
    min -= 1;
    max -= 1;
  }

  if (
    input.ridingStyle === "freeride" ||
    input.terrainPriority === "groomers-carving" ||
    input.terrainPriority === "soft-snow"
  ) {
    min += 1;
    max += 1;
  }

  if (input.aggressiveness === "relaxed") {
    min -= 1;
    max -= 1;
  }

  if (input.aggressiveness === "aggressive") {
    min += 1;
    max += 1;
  }

  min = clamp(min, 1, 9);
  max = clamp(max, min + 1, 10);

  return { min, max };
}

function getFlexCompatibility(flex: number, input: QuizInput) {
  const preferredRange = getFlexPreferenceRange(input);
  const target = (preferredRange.min + preferredRange.max) / 2;

  if (flex >= preferredRange.min && flex <= preferredRange.max) {
    const tolerance = Math.max((preferredRange.max - preferredRange.min) / 2, 1);
    const distance = Math.abs(flex - target);
    const closeness = clamp(1 - distance / tolerance, 0, 1);

    return {
      score: roundScore(12 + closeness * 6),
      reason:
        "Жёсткость доски ближе к тому диапазону, который логичен под ваш темп и сценарий катания.",
      preferredRange,
    };
  }

  const distanceToRange = Math.min(
    Math.abs(flex - preferredRange.min),
    Math.abs(flex - preferredRange.max),
  );

  if (distanceToRange <= 1) {
    return {
      score: 8,
      reason: null,
      preferredRange,
    };
  }

  if (distanceToRange <= 2) {
    return {
      score: 2,
      reason: null,
      preferredRange,
    };
  }

  return {
    score: -8,
    reason: null,
    preferredRange,
  };
}

function getPreferredOverWidth(input: QuizInput) {
  let preferredOverWidth = 4;

  if (
    input.ridingStyle === "park" ||
    input.terrainPriority === "switch-freestyle"
  ) {
    preferredOverWidth -= 1.5;
  }

  if (input.aggressiveness === "relaxed") {
    preferredOverWidth -= 0.5;
  }

  if (
    input.ridingStyle === "freeride" ||
    input.terrainPriority === "soft-snow" ||
    input.terrainPriority === "groomers-carving"
  ) {
    preferredOverWidth += 1.5;
  }

  if (input.aggressiveness === "aggressive") {
    preferredOverWidth += 0.5;
  }

  return clamp(preferredOverWidth, 2, 7);
}

function getWidthCompatibility(
  widthDelta: number,
  input: QuizInput,
) {
  const preferredOverWidth = getPreferredOverWidth(input);

  if (widthDelta >= 0 && widthDelta <= preferredOverWidth) {
    const closeness = clamp(1 - widthDelta / Math.max(preferredOverWidth, 1), 0, 1);
    return {
      score: roundScore(12 + closeness * 8),
      reason:
        "Ширины хватает под ботинок без лишнего ухода в слишком широкую платформу.",
    };
  }

  if (widthDelta > preferredOverWidth && widthDelta <= preferredOverWidth + 4) {
    return {
      score: roundScore(6 - (widthDelta - preferredOverWidth) * 1.5),
      reason:
        "Ширина безопасная, но эта доска уже чуть шире оптимума под ваш сценарий.",
    };
  }

  if (widthDelta >= -3) {
    return {
      score: 3,
      reason: null,
    };
  }

  return {
    score: -24,
    reason: "Ширина может быть пограничной для вашего ботинка и требует осторожности.",
  };
}

function getRecommendationRole(
  sizeCm: number,
  lengthTarget: number,
  widthDelta: number,
): { role: RecommendationRole; fitLabel: string } {
  if (widthDelta >= 6) {
    return {
      role: "width-safe",
      fitLabel: "запас по ширине",
    };
  }

  if (sizeCm <= lengthTarget - 0.75) {
    return {
      role: "playful",
      fitLabel: "более игривый",
    };
  }

  if (sizeCm >= lengthTarget + 0.75) {
    return {
      role: "stable",
      fitLabel: "более стабильный",
    };
  }

  return {
    role: "best-overall",
    fitLabel: "лучший общий",
  };
}

function getRecommendationConfidence(
  score: number,
  isCatalogReadyFlag: boolean,
): {
  confidence: RecommendationConfidence;
  confidenceLabel: string;
} {
  if (score >= 78 && isCatalogReadyFlag) {
    return {
      confidence: "high",
      confidenceLabel: "Высокая уверенность в совпадении.",
    };
  }

  if (score >= 64) {
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
  const catalogReady = isReadyForCatalog(product);
  const verifiedProduct = isVerifiedProduct(product);

  const lengthCompatibility = getLengthCompatibility(size.sizeCm, lengthRange, input);
  score += lengthCompatibility.score;
  if (lengthCompatibility.reason) {
    reasons.push(lengthCompatibility.reason);
  }

  const weightCompatibility = getWeightCompatibility(size, input.weightKg);
  score += weightCompatibility.score;
  if (weightCompatibility.reason) {
    reasons.push(weightCompatibility.reason);
  }

  const styleScore = getStyleCompatibility(product.ridingStyle, input);
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
    reasons.push("Уровень доски не выбивается из вашего текущего уровня катания.");
  }

  const flexCompatibility = getFlexCompatibility(product.flex, input);
  score += flexCompatibility.score;
  if (flexCompatibility.reason) {
    reasons.push(flexCompatibility.reason);
  }

  score += getBoardLineCompatibility(product, input.boardLinePreference);

  const widthCompatibility = getWidthCompatibility(widthDelta, input);
  score += widthCompatibility.score;
  if (widthCompatibility.reason) {
    reasons.push(widthCompatibility.reason);
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
    lengthCompatibility.target,
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
    const availableSizes = product.sizes.filter(
      (size) => size.isAvailable !== false,
    );

    if (availableSizes.length === 0) {
      return [];
    }

    const matches = availableSizes.map((size) =>
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
    .filter((match) => match.score >= 56)
    .slice(0, 4);

  if (recommendedBoards.length < 3) {
    recommendedBoards = sortedBoards.slice(0, Math.min(4, sortedBoards.length));
  }

  const recommendedKeys = new Set(
    recommendedBoards.map((match) => `${match.product.id}-${match.size.sizeCm}`),
  );

  const avoidBoards = sortedBoards
    .filter(
      (match) => !recommendedKeys.has(`${match.product.id}-${match.size.sizeCm}`),
    )
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
  const lengthTarget = getLengthTarget(lengthRange, input);
  const flexRange = getFlexPreferenceRange(input);

  return [
    `Вес ${input.weightKg} кг даёт базовый диапазон ${weightRange.min}-${weightRange.max} см. Дальше мы мягко подправили его под рост ${input.heightCm} см, стиль ${ridingStyleLabels[input.ridingStyle]} и ваш ${aggressivenessLabels[input.aggressiveness]} темп катания.`,
    `Итоговый диапазон ${lengthRange.min}-${lengthRange.max} см остаётся рабочей зоной, но внутри неё сервис дополнительно ищет размер ближе к идеальной точке около ${lengthTarget.toFixed(1)} см, а не просто любую доску "в пределах".`,
    buildTerrainPriorityExplanation(input.terrainPriority),
    `Размер ботинка EU ${input.bootSizeEu} и ${stanceLabels[input.stanceType]} выводят вас в категорию ${widthTypeLabels[recommendedWidthType]}. Мы ориентируемся на целевую талию около ${targetWaistWidthMm} мм и отдельно штрафуем варианты, которые становятся заметно шире нужного. ${widthTypeDescriptions[recommendedWidthType]}`,
    `${shapeProfile.headline} Базовый ориентир здесь — ${boardShapeLabels[shapeProfile.primary]}. ${shapeProfile.description}`,
    `По жёсткости доски сейчас логичнее смотреть в диапазон ${flexRange.min}-${flexRange.max} из 10: это помогает не тянуть слишком дубовую модель в relaxed/park-сценарий и не опускаться слишком мягко в aggressive/freeride.`,
    `Риск boot drag сейчас оценивается как ${bootDragRiskLabels[bootDragRisk]}. Это не абсолютный приговор, а понятная подсказка: при выборе доски уже видно, где ширина безопасна, а где лучше не рисковать.`,
    `В подборе мы дополнительно учитываем линию ${boardLineLabels[input.boardLinePreference]} и уровень ${skillLevelLabels[input.skillLevel]}, а в выдаче выше ставим проверенные карточки с живыми ссылками, чтобы рекомендации выглядели надёжнее.`,
  ];
}

export function getRecommendation(
  input: QuizInput,
  boards: Product[] = getDemoProducts(),
): RecommendationResult {
  const activeBoards = boards.filter(
    (board) =>
      board.isActive &&
      board.sizes.some((size) => size.isAvailable !== false),
  );
  const verifiedBoards = activeBoards.filter(
    (board) => board.dataStatus === "verified",
  );
  const baseCandidateBoards =
    verifiedBoards.length >= 3 ? verifiedBoards : activeBoards;
  const candidateBoards = getStyleFocusedBoards(baseCandidateBoards, input);
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
    algorithmVersion: ALGORITHM_VERSION,
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
