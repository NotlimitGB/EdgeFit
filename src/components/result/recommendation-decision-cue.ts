import type { RecommendationRole } from "@/types/domain";

export interface RecommendationDecisionCue {
  label: string;
  summary: string;
}

const alternativeCues: Record<
  RecommendationRole,
  RecommendationDecisionCue
> = {
  "best-overall": {
    label: "Альтернатива · нейтральный вариант",
    summary:
      "Выбирай вместо первого, если хочется сравнить ещё один сбалансированный вариант без явного смещения в одну сторону.",
  },
  playful: {
    label: "Альтернатива · более живой вариант",
    summary:
      "Выбирай вместо первого, если хочется более живого и манёвренного ощущения.",
  },
  stable: {
    label: "Альтернатива · больше стабильности",
    summary:
      "Выбирай вместо первого, если важнее более спокойное и стабильное ощущение на скорости.",
  },
  "width-safe": {
    label: "Альтернатива · больше запаса по ширине",
    summary:
      "Выбирай вместо первого, если особенно важен запас по ширине под ботинок.",
  },
};

export function getRecommendationDecisionCue(
  position: number,
  role: RecommendationRole,
): RecommendationDecisionCue {
  if (position === 1) {
    return {
      label: "Основной выбор · №1",
      summary:
        "Начни с этого варианта — он стоит первым в текущем подборе.",
    };
  }

  return alternativeCues[role];
}
