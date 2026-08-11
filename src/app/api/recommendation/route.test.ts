import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationResult } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  recommendation: null as RecommendationResult | null,
}));

vi.mock("@/lib/products", () => ({
  получитьВсеМодели: async () => [{ id: "product-1" }],
}));
vi.mock("@/lib/recommendation/engine", () => ({
  getRecommendation: () => mocks.recommendation,
}));
vi.mock("@/lib/quiz-results", () => ({
  сохранитьРезультатКвиза: (...parameters: unknown[]) => mocks.save(...parameters),
}));

import { POST } from "@/app/api/recommendation/route";
import {
  SAVED_RESULT_TOKEN_HEADER,
  isSavedResultToken,
} from "@/lib/saved-result-contract";

const recommendation: RecommendationResult = {
  algorithmVersion: "v1.6.3",
  input: {
    heightCm: 178,
    weightKg: 74,
    bootSizeEu: 43,
    boardLinePreference: "men",
    skillLevel: "intermediate",
    ridingStyle: "all-mountain",
    terrainPriority: "balanced",
    aggressiveness: "balanced",
    stanceType: "standard",
  },
  lengthRange: { min: 152, max: 156 },
  recommendedWidthType: "regular",
  shapeProfile: {
    primary: "directional-twin",
    alternatives: [],
    headline: "Универсальная форма",
    description: "Стабильность и контроль.",
  },
  targetWaistWidthMm: 250,
  bootDragRisk: "low",
  explanation: [],
  recommendedBoards: [],
  avoidBoards: [],
};

describe("recommendation API saved-result transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recommendation = recommendation;
  });

  it("keeps the response body exact and omits saved headers without a token", async () => {
    mocks.save.mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/recommendation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recommendation.input),
      }),
    );

    expect(await response.json()).toEqual(recommendation);
    expect(response.headers.get(SAVED_RESULT_TOKEN_HEADER)).toBeNull();
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("adds only the bearer token header and private caching on snapshot success", async () => {
    const token = "a".repeat(43);
    expect(isSavedResultToken(token)).toBe(true);
    mocks.save.mockResolvedValue(token);

    const response = await POST(
      new Request("http://localhost/api/recommendation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recommendation.input),
      }),
    );

    expect(await response.json()).toEqual(recommendation);
    expect(response.headers.get(SAVED_RESULT_TOKEN_HEADER)).toBe(token);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });
});
