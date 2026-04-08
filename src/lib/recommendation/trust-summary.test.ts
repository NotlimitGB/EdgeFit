import { describe, expect, it } from "vitest";
import { demoRecommendation } from "@/lib/recommendation/demo";
import { buildRecommendationTrustSummary } from "./trust-summary";

describe("buildRecommendationTrustSummary", () => {
  it("builds a summary for the current recommendation set", () => {
    const summary = buildRecommendationTrustSummary(demoRecommendation);

    expect(summary.totalCount).toBeGreaterThan(0);
    expect(summary.readyCount).toBeLessThanOrEqual(summary.totalCount);
    expect(summary.needsReviewCount).toBe(summary.totalCount - summary.readyCount);
    expect(summary.headline.length).toBeGreaterThan(0);
  });
});

