import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationResult } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  getRecommendation: vi.fn(),
  getFocusedBoardCheck: vi.fn(),
  getRecommendationCatalog: vi.fn(),
  resolveCanonicalBoardRouteBySlug: vi.fn(),
  recommendation: null as RecommendationResult | null,
}));

vi.mock("@/lib/products", () => ({
  getRecommendationCatalog: (...parameters: unknown[]) =>
    mocks.getRecommendationCatalog(...parameters),
}));
vi.mock("@/lib/recommendation/engine", () => ({
  getRecommendation: (...parameters: unknown[]) =>
    mocks.getRecommendation(...parameters),
  getFocusedBoardCheck: (...parameters: unknown[]) =>
    mocks.getFocusedBoardCheck(...parameters),
}));
vi.mock("@/lib/canonical-catalog", () => ({
  resolveCanonicalBoardRouteBySlug: (...parameters: unknown[]) =>
    mocks.resolveCanonicalBoardRouteBySlug(...parameters),
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
  algorithmVersion: "v1.6.4",
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
    mocks.getRecommendation.mockReturnValue(recommendation);
    mocks.getFocusedBoardCheck.mockReturnValue({
      board: { slug: "focused-board", brand: "Focused", modelName: "Board" },
      verdict: "GOOD",
      bestFitSize: { sizeCm: 154, sizeLabel: "154" },
      buyability: "AVAILABLE",
      signals: [],
      alternatives: [],
    });
    mocks.getRecommendationCatalog.mockResolvedValue({
      products: [{ id: "product-1" }],
      familyKeyByProductId: { "product-1": "family:family-1" },
    });
  });

  it("returns the buyer-facing 503 message when the catalog is empty", async () => {
    mocks.getRecommendationCatalog.mockResolvedValue({
      products: [],
      familyKeyByProductId: {},
    });
    const response = await POST(
      new Request("http://localhost/api/recommendation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recommendation.input),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: "Не удалось загрузить каталог. Попробуй ещё раз немного позже.",
    });
    expect(mocks.getRecommendation).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
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

  it("passes internal family identity to the engine without exposing it in the body", async () => {
    mocks.save.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/recommendation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recommendation.input),
      }),
    );
    const body = await response.json();

    expect(mocks.getRecommendation).toHaveBeenCalledWith(
      recommendation.input,
      [{ id: "product-1" }],
      { familyKeyByProductId: { "product-1": "family:family-1" } },
    );
    expect(JSON.stringify(body)).not.toMatch(
      /familyId|familyKey|familyMemberRole/u,
    );
  });

  it("separates optional purchase preferences before calling the engine", async () => {
    mocks.save.mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/recommendation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...recommendation.input,
          purchasePreferences: { budgetMaxRub: 40_000 },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(recommendation);
    expect(mocks.getRecommendation).toHaveBeenCalledWith(
      recommendation.input,
      expect.any(Array),
      expect.any(Object),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        вход: recommendation.input,
        purchasePreferences: { budgetMaxRub: 40_000 },
      }),
    );
  });

  it("rejects malformed purchase preferences", async () => {
    const response = await POST(
      new Request("http://localhost/api/recommendation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...recommendation.input,
          purchasePreferences: { budgetMaxRub: 40_000.5 },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.getRecommendation).not.toHaveBeenCalled();
  });

  it("keeps the generic response byte-shape free of focused fields", async () => {
    mocks.save.mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/recommendation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recommendation.input),
      }),
    );

    expect(await response.json()).toEqual(recommendation);
    expect(mocks.resolveCanonicalBoardRouteBySlug).not.toHaveBeenCalled();
    expect(mocks.getFocusedBoardCheck).not.toHaveBeenCalled();
  });

  it("rejects an explicitly supplied unresolved focused board", async () => {
    mocks.resolveCanonicalBoardRouteBySlug.mockResolvedValue(undefined);
    const response = await POST(
      new Request("http://localhost/api/recommendation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...recommendation.input,
          focusedBoardSlug: "missing-board",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message:
        "Выбранная модель не найдена. Вернись к карточке доски и попробуй снова.",
    });
    expect(mocks.getRecommendationCatalog).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("adds the independently evaluated focused board to response and snapshot", async () => {
    const item = { slug: "focused-board", brand: "Focused", modelName: "Board" };
    mocks.resolveCanonicalBoardRouteBySlug.mockResolvedValue({
      kind: "render",
      item,
    });
    mocks.save.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/recommendation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...recommendation.input,
          focusedBoardSlug: "focused-board",
        }),
      }),
    );
    const body = await response.json();

    expect(mocks.getFocusedBoardCheck).toHaveBeenCalledWith(
      recommendation,
      item,
      { familyKeyByProductId: { "product-1": "family:family-1" } },
    );
    expect(body.focusedBoardCheck).toMatchObject({ verdict: "GOOD" });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ результат: body }),
    );
  });
});
