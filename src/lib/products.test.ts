import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildRecommendationFamilyKeyByProductId } from "@/lib/products";

describe("recommendation catalog identity", () => {
  it("uses collision-safe family and Product keys", () => {
    expect(
      buildRecommendationFamilyKeyByProductId([
        { id: "base-offer", familyId: "family-1" },
        { id: "wide-offer", familyId: "family-1" },
        { id: "singleton", familyId: null },
      ]),
    ).toEqual({
      "base-offer": "family:family-1",
      "wide-offer": "family:family-1",
      singleton: "product:singleton",
    });
  });

  it("keeps every Product independent when legacy schema rows have no family ID", () => {
    expect(
      buildRecommendationFamilyKeyByProductId([
        { id: "legacy-a", familyId: null },
        { id: "legacy-b", familyId: null },
      ]),
    ).toEqual({
      "legacy-a": "product:legacy-a",
      "legacy-b": "product:legacy-b",
    });
  });
});
