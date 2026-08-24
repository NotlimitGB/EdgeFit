import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RecommendationResult } from "@/types/domain";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

import {
  buildResultStoreClickAction,
  ResultView,
} from "@/components/result/result-view";

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
  explanation: ["Диапазон рассчитан."],
  recommendedBoards: [
    {
      product: {
        id: "product-1",
        slug: "jones-mountain-twin",
        brand: "Jones",
        modelName: "Mountain Twin",
        descriptionShort: "Test board",
        descriptionFull: "Test board",
        ridingStyle: "all-mountain",
        skillLevel: "intermediate",
        flex: 6,
        priceFrom: 59_990,
        imageUrl: "",
        affiliateUrl: "https://traektoria.ru/product/1_board/",
        isActive: true,
        boardLine: "men",
        shapeType: "directional-twin",
        camberProfile: "hybrid-camber",
        dataStatus: "verified",
        sourceName: null,
        sourceUrl: null,
        sourceCheckedAt: null,
        scenarios: [],
        notIdealFor: [],
        sizes: [],
      },
      size: {
        sizeCm: 156,
        sizeLabel: "156 cm",
        waistWidthMm: 254,
        recommendedWeightMin: 65,
        recommendedWeightMax: 85,
        widthType: "regular",
        isAvailable: true,
      },
      score: 92,
      fitLabel: "Точный fit",
      role: "best-overall",
      confidence: "high",
      confidenceLabel: "Высокая уверенность",
      isCatalogReady: true,
      reasons: ["Подходит по длине", "Подходит по ширине"],
    },
  ],
  avoidBoards: [],
};

describe("ResultView saved mode", () => {
  it("renders the immutable snapshot notice without email or copy controls", () => {
    const markup = renderToStaticMarkup(
      <ResultView initialRecommendation={recommendation} mode="saved" />,
    );

    expect(markup).toContain("Сохранённый результат");
    expect(markup).toContain("снимок fit");
    expect(markup).not.toContain("result-email");
    expect(markup).not.toContain("Скопировать ссылку");
    expect(markup).not.toContain("save-result-title");
    expect(markup).toContain("Проверить в магазине");
    expect(markup).not.toContain("Траектория");
  });
});

describe("result store click provenance", () => {
  const match = recommendation.recommendedBoards[0];

  it("captures the displayed size, primary rank and exact merchant offer", () => {
    const action = buildResultStoreClickAction({
      match,
      source: "result-top",
      placement: "primary_recommendation",
      recommendationRank: 1,
      algorithmVersion: recommendation.algorithmVersion,
      isSavedMode: false,
      resultPayload: {
        result_width_type: recommendation.recommendedWidthType,
        riding_style: recommendation.input.ridingStyle,
      },
    });

    expect(action.analyticsPayload).toMatchObject({
      product_id: "product-1",
      product_slug: "jones-mountain-twin",
      brand: "Jones",
      model_name: "Mountain Twin",
      size_label: "156",
      recommendation_rank: 1,
      recommendation_score: 92,
      placement: "primary_recommendation",
      store_code: "traektoria",
      source_product_id: "1",
      destination_url: "https://traektoria.ru/product/1_board/",
      result_variant: "session",
      algorithm_version: "v1.6.3",
      result_width_type: "regular",
      riding_style: "all-mountain",
    });
    expect(action.href).toContain("recommendationRank=1");
    expect(action.href).toContain("sizeLabel=156");
  });

  it.each([
    ["alternative_recommendation", 2],
    ["decision_guide", 2],
    ["recommendation_comparison", 2],
  ] as const)("preserves rendered rank for %s", (placement, rank) => {
    const action = buildResultStoreClickAction({
      match,
      source: `result-${placement}`,
      placement,
      recommendationRank: rank,
      algorithmVersion: recommendation.algorithmVersion,
      isSavedMode: false,
    });

    expect(action.analyticsPayload).toMatchObject({
      placement,
      recommendation_rank: rank,
    });
  });

  it("uses a null rank for a caution recommendation", () => {
    const action = buildResultStoreClickAction({
      match,
      source: "result-avoid",
      placement: "caution_recommendation",
      recommendationRank: null,
      algorithmVersion: recommendation.algorithmVersion,
      isSavedMode: false,
    });

    expect(action.analyticsPayload).toMatchObject({
      placement: "caution_recommendation",
      recommendation_rank: null,
    });
    expect(action.href).not.toContain("recommendationRank");
  });

  it("keeps saved-result analytics disabled", () => {
    const action = buildResultStoreClickAction({
      match,
      source: "saved-result-top",
      placement: "primary_recommendation",
      recommendationRank: 1,
      algorithmVersion: recommendation.algorithmVersion,
      isSavedMode: true,
    });

    expect(action.analyticsPayload).toBeUndefined();
    expect(action.href).not.toContain("recommendationRank");
  });
});
