import { describe, expect, it } from "vitest";
import { getRecommendation } from "@/lib/recommendation/engine";
import { demoInput, demoRecommendation } from "@/lib/recommendation/demo";
import { buildRecommendationPriorityImpact } from "./priority-impact";

describe("buildRecommendationPriorityImpact", () => {
  it("explains the neutral case without extra length shift", () => {
    const impact = buildRecommendationPriorityImpact(demoRecommendation);

    expect(impact.cards).toHaveLength(3);
    expect(impact.cards[0]).toMatchObject({
      label: "Длина",
      value: "без лишнего сдвига",
    });
    expect(impact.summary).toContain("универсальный");
  });

  it("explains the switch-oriented scenario as more lively and twin-focused", () => {
    const recommendation = getRecommendation({
      ...demoInput,
      terrainPriority: "switch-freestyle",
      ridingStyle: "park",
    });
    const impact = buildRecommendationPriorityImpact(recommendation);

    expect(impact.headline).toContain("живое катание");
    expect(impact.cards[0]?.value).toBe("чуть короче и живее");
    expect(impact.cards[1]?.description).toContain("свиче");
  });

  it("explains the soft snow scenario as longer and calmer outside groomers", () => {
    const recommendation = getRecommendation({
      ...demoInput,
      terrainPriority: "soft-snow",
      ridingStyle: "freeride",
      aggressiveness: "aggressive",
    });
    const impact = buildRecommendationPriorityImpact(recommendation);

    expect(impact.cards[0]?.value).toBe("длиннее с запасом");
    expect(impact.cards[2]?.value).toBe("спокойнее вне трассы");
    expect(impact.cards[1]?.value.length).toBeGreaterThan(0);
  });
});
