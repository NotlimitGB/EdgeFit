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
  buildResultAnalyticsPayload,
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
        sizes: [
          {
            sizeCm: 156,
            sizeLabel: "156 cm",
            waistWidthMm: 254,
            recommendedWeightMin: 65,
            recommendedWeightMax: 85,
            widthType: "regular",
            isAvailable: true,
          },
        ],
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
    expect(markup).not.toContain("Помогла рекомендация принять решение?");
    expect(markup).toContain("Твой профиль");
    expect(markup).toContain("Бюджет");
    expect(markup).toContain("не указан");
  });

  it("keeps an over-budget Top 1 ahead of a lower-price alternative", () => {
    const alternative = {
      ...recommendation.recommendedBoards[0],
      product: {
        ...recommendation.recommendedBoards[0].product,
        id: "product-2",
        slug: "lower-price-alternative",
        modelName: "Lower Price Alternative",
        priceFrom: 30_000,
      },
    };
    const withAlternative = {
      ...recommendation,
      recommendedBoards: [recommendation.recommendedBoards[0], alternative],
    };
    const markup = renderToStaticMarkup(
      <ResultView
        initialRecommendation={withAlternative}
        initialPurchasePreferences={{ budgetMaxRub: 50_000 }}
        mode="saved"
      />,
    );

    expect(markup.indexOf("Mountain Twin")).toBeLessThan(
      markup.indexOf("Lower Price Alternative"),
    );
    expect(markup).toContain("до 50 000 ₽");
    expect(markup).toContain("цена была выше указанного бюджета");
    expect(markup).toContain("цена была не выше указанного бюджета");
  });
});

describe("ResultView rider profile placement", () => {
  it("renders one complete profile after the fit summary and before explanation", () => {
    const markup = renderToStaticMarkup(
      <ResultView initialRecommendation={recommendation} mode="session" />,
    );
    const fitTitle = markup.indexOf("Твой рабочий fit");
    const profileTitle = markup.indexOf("Твой профиль");
    const explanationTitle = markup.indexOf("Почему получился такой fit");

    expect(markup.match(/Твой профиль/g)).toHaveLength(1);
    expect(markup).not.toContain("Контекст расчёта");
    expect(fitTitle).toBeGreaterThanOrEqual(0);
    expect(profileTitle).toBeGreaterThan(fitTitle);
    expect(explanationTitle).toBeGreaterThan(profileTitle);
    expect(markup).toContain("не указан");
    expect(markup.indexOf("Mountain Twin")).toBeGreaterThan(profileTitle);
  });
});

describe("ResultView recommendation feedback placement", () => {
  it("renders feedback after the primary card in session mode", () => {
    const markup = renderToStaticMarkup(
      <ResultView initialRecommendation={recommendation} mode="session" />,
    );
    const primaryTitle = markup.indexOf("Mountain Twin");
    const feedbackTitle = markup.indexOf("Помогла рекомендация принять решение?");

    expect(primaryTitle).toBeGreaterThanOrEqual(0);
    expect(feedbackTitle).toBeGreaterThan(primaryTitle);
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
      purchasePreferences: { budgetMaxRub: 50_000 },
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
      exact_size_offer_status: "confirmed_available",
      exact_size_matched: true,
      result_width_type: "regular",
      riding_style: "all-mountain",
      clicked_product_budget_relation: "over_catalog_estimate",
    });
    expect(action.href).toContain("recommendationRank=1");
    expect(action.href).toContain("sizeLabel=156");
    expect(action.href).toContain("budgetMaxRub=50000");
    expect(action.offerIntelligence.status).toBe("confirmed_available");
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
    expect(action.offerIntelligence.status).toBe("search_only");
  });
});

describe("result budget analytics", () => {
  it("reports top recommendation relation without changing recommendation data", () => {
    const payload = buildResultAnalyticsPayload(recommendation, {
      budgetMaxRub: 50_000,
    });

    expect(payload).toMatchObject({
      budget_set: true,
      budget_max_rub: 50_000,
      top_recommendation_budget_relation: "over_catalog_estimate",
    });
    expect(recommendation.recommendedBoards[0].product.slug).toBe(
      "jones-mountain-twin",
    );
  });
});
