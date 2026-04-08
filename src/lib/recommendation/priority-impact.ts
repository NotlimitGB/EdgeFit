import { boardShapeLabels, terrainPriorityLabels } from "@/lib/content";
import { getTerrainPriorityLengthAdjustment } from "@/lib/recommendation/shape-profile";
import type { RecommendationResult } from "@/types/domain";

export interface RecommendationPriorityImpactCard {
  id: "length" | "shape" | "feel";
  label: string;
  value: string;
  description: string;
}

export interface RecommendationPriorityImpact {
  headline: string;
  summary: string;
  cards: RecommendationPriorityImpactCard[];
}

function buildHeadline(recommendation: RecommendationResult) {
  switch (recommendation.input.terrainPriority) {
    case "switch-freestyle":
      return "Приоритет на свич и более живое катание удержал подбор ближе к маневренной стороне.";
    case "groomers-carving":
      return "Приоритет на трассу и дуги слегка собрал подбор в сторону стабильности и направленности.";
    case "soft-snow":
      return "Приоритет на мягкий снег добавил запас по длине и усилил формы, которые спокойнее работают вне трассы.";
    default:
      return "Выбран универсальный приоритет, поэтому сервис оставил подбор без лишнего смещения в крайние сценарии.";
  }
}

function buildSummary(recommendation: RecommendationResult) {
  const priorityLabel =
    terrainPriorityLabels[recommendation.input.terrainPriority];

  switch (recommendation.input.terrainPriority) {
    case "switch-freestyle":
      return `Вы выбрали сценарий "${priorityLabel}", поэтому сервис чуть сильнее поддерживает более живую подачу доски, комфорт в свиче и быстрое перекантовывание.`;
    case "groomers-carving":
      return `Вы выбрали сценарий "${priorityLabel}", поэтому сервис мягко смещает результат в сторону собранной длины и более направленного ощущения доски на скорости.`;
    case "soft-snow":
      return `Вы выбрали сценарий "${priorityLabel}", поэтому сервис дает больше запаса по длине и поднимает формы, которые спокойнее ведут себя в разбитом и мягком снегу.`;
    default:
      return `Вы выбрали сценарий "${priorityLabel}", поэтому сервис оставляет подбор максимально нейтральным и не тянет его отдельно ни в парк, ни во freeride.`;
  }
}

function buildLengthCard(
  recommendation: RecommendationResult,
): RecommendationPriorityImpactCard {
  const adjustment = getTerrainPriorityLengthAdjustment(
    recommendation.input.terrainPriority,
  );
  const rangeLabel = `${recommendation.lengthRange.min}-${recommendation.lengthRange.max} см`;

  switch (recommendation.input.terrainPriority) {
    case "switch-freestyle":
      return {
        id: "length",
        label: "Длина",
        value: "чуть короче и живее",
        description: `Рабочий диапазон ${rangeLabel} удерживается ближе к нижней части нейтрального сценария: это снижает лишнюю инерцию и делает доску проще в перекантовке.`,
      };
    case "groomers-carving":
      return {
        id: "length",
        label: "Длина",
        value: "чуть собраннее",
        description: `Рабочий диапазон ${rangeLabel} слегка сдвинут вверх относительно нейтрального варианта на ${adjustment.max} см, чтобы добавить больше опоры в дуге и на скорости.`,
      };
    case "soft-snow":
      return {
        id: "length",
        label: "Длина",
        value: "длиннее с запасом",
        description: `Рабочий диапазон ${rangeLabel} получил прибавку до ${adjustment.max} см относительно нейтрального сценария, чтобы дать больше опоры и плавучести вне трассы.`,
      };
    default:
      return {
        id: "length",
        label: "Длина",
        value: "без лишнего сдвига",
        description: `Рабочий диапазон ${rangeLabel} не смещается дополнительно вверх или вниз: это базовый универсальный подбор без отдельного уклона в парк или мягкий снег.`,
      };
  }
}

function buildShapeCard(
  recommendation: RecommendationResult,
): RecommendationPriorityImpactCard {
  const primaryShape = boardShapeLabels[recommendation.shapeProfile.primary];
  const alternatives = recommendation.shapeProfile.alternatives
    .map((shape) => boardShapeLabels[shape])
    .join(", ");

  switch (recommendation.input.terrainPriority) {
    case "switch-freestyle":
      return {
        id: "shape",
        label: "Форма",
        value: primaryShape,
        description: `В приоритете формы, которые легче раскрываются в свиче и в более игривом катании. Рядом остаются ${alternatives} как более универсальные компромиссы.`,
      };
    case "groomers-carving":
      return {
        id: "shape",
        label: "Форма",
        value: primaryShape,
        description: `Подбор поднимает выше формы, которые увереннее входят в дугу и спокойнее держат скорость. Альтернативы вроде ${alternatives} остаются в рабочей зоне, если хочется меньше перекоса.`,
      };
    case "soft-snow":
      return {
        id: "shape",
        label: "Форма",
        value: primaryShape,
        description: `Подбор усиливает формы с большим запасом для мягкого снега и разбитого рельефа. Альтернативы вроде ${alternatives} остаются как более нейтральные варианты.`,
      };
    default:
      return {
        id: "shape",
        label: "Форма",
        value: primaryShape,
        description: `Подбор не уходит в крайность и держит форму как универсальный центр. Допустимыми рядом остаются ${alternatives}, если модель сильна по длине и ширине.`,
      };
  }
}

function buildFeelCard(
  recommendation: RecommendationResult,
): RecommendationPriorityImpactCard {
  switch (recommendation.input.terrainPriority) {
    case "switch-freestyle":
      return {
        id: "feel",
        label: "Ощущение",
        value: "живее под ногами",
        description: "Этот приоритет делает акцент на более быстрой перекантовке, понятном свиче и меньшем ощущении тяжелой доски в ногах.",
      };
    case "groomers-carving":
      return {
        id: "feel",
        label: "Ощущение",
        value: "стабильнее в дуге",
        description: "Этот приоритет усиливает ощущение собранной доски, которая спокойнее стоит на канте и увереннее ощущается на скорости.",
      };
    case "soft-snow":
      return {
        id: "feel",
        label: "Ощущение",
        value: "спокойнее вне трассы",
        description: "Этот приоритет добавляет больше запаса в разбитом и мягком снегу, чтобы доска ощущалась менее нервной вне ровной трассы.",
      };
    default:
      return {
        id: "feel",
        label: "Ощущение",
        value: "максимально универсально",
        description: "Этот приоритет оставляет самый нейтральный характер: без лишнего уклона ни в игривую, ни в сугубо направленную подачу доски.",
      };
  }
}

export function buildRecommendationPriorityImpact(
  recommendation: RecommendationResult,
): RecommendationPriorityImpact {
  return {
    headline: buildHeadline(recommendation),
    summary: buildSummary(recommendation),
    cards: [
      buildLengthCard(recommendation),
      buildShapeCard(recommendation),
      buildFeelCard(recommendation),
    ],
  };
}
