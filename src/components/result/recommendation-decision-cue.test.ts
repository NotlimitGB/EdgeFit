import { describe, expect, it } from "vitest";
import type { RecommendationRole } from "@/types/domain";
import { getRecommendationDecisionCue } from "./recommendation-decision-cue";

const roles: RecommendationRole[] = [
  "best-overall",
  "playful",
  "stable",
  "width-safe",
];

describe("getRecommendationDecisionCue", () => {
  it.each(roles)("uses rank-driven primary semantics for %s", (role) => {
    expect(getRecommendationDecisionCue(1, role)).toEqual({
      label: "Основной выбор · №1",
      summary:
        "Начни с этого варианта — он стоит первым в текущем подборе.",
    });
  });

  it.each([
    ["playful", "Альтернатива · более живой вариант", "манёвренного"],
    ["stable", "Альтернатива · больше стабильности", "на скорости"],
    [
      "width-safe",
      "Альтернатива · больше запаса по ширине",
      "под ботинок",
    ],
    [
      "best-overall",
      "Альтернатива · нейтральный вариант",
      "сбалансированный",
    ],
  ] as const)(
    "uses the existing %s role for alternative copy",
    (role, label, summaryFragment) => {
      const cue = getRecommendationDecisionCue(2, role);

      expect(cue.label).toBe(label);
      expect(cue.summary).toContain(summaryFragment);
    },
  );

  it("is deterministic for duplicate alternative roles", () => {
    expect(getRecommendationDecisionCue(2, "stable")).toEqual(
      getRecommendationDecisionCue(3, "stable"),
    );
  });
});
