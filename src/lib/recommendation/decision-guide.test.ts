import { describe, expect, it } from "vitest";
import { demoRecommendation } from "@/lib/recommendation/demo";
import { buildRecommendationDecisionGuide } from "./decision-guide";

describe("buildRecommendationDecisionGuide", () => {
  it("returns three practical choice scenarios when recommendations exist", () => {
    const items = buildRecommendationDecisionGuide(demoRecommendation);

    expect(items).toHaveLength(3);
    expect(items[0]?.boardTitle.length).toBeGreaterThan(0);
    expect(items[1]?.sizeLabel.length).toBeGreaterThan(0);
    expect(items[2]?.highlight.length).toBeGreaterThan(0);
  });
});

