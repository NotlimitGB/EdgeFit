import { describe, expect, it } from "vitest";
import { demoRecommendation } from "@/lib/recommendation/demo";
import { buildRecommendationComparison } from "./comparison";

describe("buildRecommendationComparison", () => {
  it("returns up to three comparison cards with highlights", () => {
    const comparison = buildRecommendationComparison(demoRecommendation);

    expect(comparison.length).toBeGreaterThan(0);
    expect(comparison.length).toBeLessThanOrEqual(3);
    expect(comparison[0]?.highlights.length).toBeGreaterThanOrEqual(4);
    expect(comparison[0]?.roleLabel.length).toBeGreaterThan(0);
  });
});

