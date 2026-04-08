import type {
  Aggressiveness,
  BoardLinePreference,
  BoardShape,
  BootDragRisk,
  ProductDataStatus,
  RidingStyle,
  SkillLevel,
  StanceType,
  TerrainPriority,
  WidthType,
} from "@/types/domain";

export const ridingStyleLabels: Record<RidingStyle, string> = {
  "all-mountain": "all-mountain",
  park: "park / freestyle",
  freeride: "freeride / powder",
};

export const skillLevelLabels: Record<SkillLevel, string> = {
  beginner: "начинающий",
  intermediate: "средний уровень",
  advanced: "продвинутый",
};

export const aggressivenessLabels: Record<Aggressiveness, string> = {
  relaxed: "спокойный",
  balanced: "сбалансированный",
  aggressive: "агрессивный",
};

export const stanceLabels: Record<StanceType, string> = {
  standard: "стандартная стойка",
  duck: "duck stance",
  unknown: "не уверен в стойке",
};

export const widthTypeLabels: Record<WidthType, string> = {
  regular: "обычная ширина",
  "mid-wide": "mid-wide",
  wide: "wide",
};

export const widthTypeDescriptions: Record<WidthType, string> = {
  regular: "Подходит большинству райдеров со стандартным размером ботинка.",
  "mid-wide": "Нужен запас по ширине, но без перехода в максимально широкую доску.",
  wide: "Широкая геометрия снижает риск зацепа ботинком при крупных размерах.",
};

export const bootDragRiskLabels: Record<BootDragRisk, string> = {
  low: "низкий",
  medium: "средний",
  high: "высокий",
};

export const boardLineLabels: Record<BoardLinePreference, string> = {
  men: "мужская / унисекс",
  women: "женская",
  any: "не важно",
};

export const boardShapeLabels: Record<BoardShape, string> = {
  twin: "твин",
  "asym-twin": "асимметричный твин",
  "directional-twin": "направленный твин",
  directional: "направленная",
  "tapered-directional": "направленная с тейпером",
};

export const terrainPriorityLabels: Record<TerrainPriority, string> = {
  balanced: "один универсальный вариант",
  "switch-freestyle": "свич, парк и side hits",
  "groomers-carving": "трасса и дуги",
  "soft-snow": "мягкий снег и разбитка",
};

export const productDataStatusLabels: Record<ProductDataStatus, string> = {
  draft: "черновик",
  verified: "проверено",
};

export function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}
