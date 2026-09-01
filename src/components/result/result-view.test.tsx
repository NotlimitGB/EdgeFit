import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RecommendationResult } from "@/types/domain";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a href={String(href)} data-prefetch={String(prefetch)} {...props}>
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

function expectCatalogLinksWithoutPrefetch(markup: string, count: number) {
  const links = Array.from(
    markup.matchAll(/<a\b[^>]*href="\/catalog"[^>]*>/g),
    ([link]) => link,
  );

  expect(links).toHaveLength(count);
  expect(links.every((link) => link.includes('data-prefetch="false"'))).toBe(
    true,
  );
}

describe("ResultView catalog prefetch", () => {
  it("disables prefetch in the missing-result action", () => {
    expectCatalogLinksWithoutPrefetch(
      renderToStaticMarkup(<ResultView mode="saved" />),
      1,
    );
  });

  it("disables prefetch in the empty-recommendations action", () => {
    expectCatalogLinksWithoutPrefetch(
      renderToStaticMarkup(
        <ResultView
          initialRecommendation={{ ...recommendation, recommendedBoards: [] }}
          mode="saved"
        />,
      ),
      2,
    );
  });

  it("disables prefetch in the final catalog action", () => {
    expectCatalogLinksWithoutPrefetch(
      renderToStaticMarkup(
        <ResultView initialRecommendation={recommendation} mode="saved" />,
      ),
      1,
    );
  });
});

describe("ResultView saved mode", () => {
  it("renders the immutable snapshot notice without email or copy controls", () => {
    const markup = renderToStaticMarkup(
      <ResultView initialRecommendation={recommendation} mode="saved" />,
    );

    expect(markup).toContain("Сохранённый результат");
    expect(markup).toContain("сохранённый результат подбора");
    expect(markup).not.toContain("result-email");
    expect(markup).not.toContain("Скопировать ссылку");
    expect(markup).not.toContain("save-result-title");
    expect(markup).toContain("Проверить в магазине");
    expect(markup).not.toContain("Траектория");
    expect(markup).not.toContain("Помогла рекомендация принять решение?");
    expect(markup).toContain("Почему именно эта модель");
    expect(markup).toContain("Твой профиль");
    expect(markup).toContain("Бюджет");
    expect(markup).toContain("не указан");
    expect(markup).toContain("Что известно о моделях");
    expect(markup).toContain("Основные данные");
    expect(markup).toContain("Нужно уточнить");
    expect(markup).not.toContain("Что известно о данных");
    expect(markup).not.toContain("Сверены");
    expect(markup).not.toContain("Перепроверить");
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
    const fitTitle = markup.indexOf("Результат подбора");
    const profileTitle = markup.indexOf("Твой профиль");
    const explanationTitle = markup.indexOf("Почему получился такой результат");

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
  it("renders the Top 1 bridge before feedback and keeps alternative reasons", () => {
    const primary = {
      ...recommendation.recommendedBoards[0],
      reasons: ["UNIQUE_TOP_REASON"],
    };
    const alternative = {
      ...primary,
      product: {
        ...primary.product,
        id: "product-2",
        slug: "alternative-board",
        modelName: "Alternative Board",
      },
      reasons: ["UNIQUE_ALT_REASON"],
      role: "stable" as const,
    };
    const withAlternative = {
      ...recommendation,
      recommendedBoards: [primary, alternative],
    };
    const markup = renderToStaticMarkup(
      <ResultView initialRecommendation={withAlternative} mode="session" />,
    );
    const primaryTitle = markup.indexOf("Mountain Twin");
    const explanationTitle = markup.indexOf("Почему именно эта модель");
    const feedbackTitle = markup.indexOf("Помогла рекомендация принять решение?");
    const alternativeTitle = markup.indexOf("Alternative Board");

    expect(primaryTitle).toBeGreaterThanOrEqual(0);
    expect(explanationTitle).toBeGreaterThan(primaryTitle);
    expect(feedbackTitle).toBeGreaterThan(explanationTitle);
    expect(alternativeTitle).toBeGreaterThan(feedbackTitle);
    expect(markup.match(/UNIQUE_TOP_REASON/g)).toHaveLength(1);
    expect(markup).toContain("UNIQUE_ALT_REASON");
    expect(markup.match(/Почему подходит/g)).toHaveLength(1);
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

describe("ResultView decision-oriented Top 3", () => {
  function buildMatch(
    id: string,
    modelName: string,
    role: RecommendationResult["recommendedBoards"][number]["role"],
    score: number,
  ) {
    const primary = recommendation.recommendedBoards[0];

    return {
      ...primary,
      product: {
        ...primary.product,
        id,
        slug: id,
        modelName,
      },
      role,
      score,
      reasons: [`REASON_${id}`],
    };
  }

  it("keeps the canonical first three in rendered order without promoting a fourth", () => {
    const matches = [
      buildMatch("board-a", "Board A", "playful", 61),
      buildMatch("board-b", "Board B", "stable", 99_991),
      buildMatch("board-c", "Board C", "width-safe", 20),
      buildMatch("board-d", "Board D", "best-overall", 100_000),
    ];
    const markup = renderToStaticMarkup(
      <ResultView
        initialRecommendation={{ ...recommendation, recommendedBoards: matches }}
        mode="session"
      />,
    );
    const comparisonStart = markup.indexOf("Финальный выбор");
    const top3Markup = markup.slice(
      markup.indexOf("С чего начать"),
      comparisonStart === -1 ? undefined : comparisonStart,
    );
    const comparisonMarkup = markup.slice(
      markup.indexOf("Финальный выбор"),
      markup.indexOf('id="email-title"'),
    );

    expect(top3Markup.indexOf("Board A")).toBeLessThan(
      top3Markup.indexOf("Board B"),
    );
    expect(top3Markup.indexOf("Board B")).toBeLessThan(
      top3Markup.indexOf("Board C"),
    );
    expect(top3Markup).not.toContain("Board D");
    expect(markup).toContain("Board D");
    expect(top3Markup).toContain("Основной выбор · №1");
    expect(top3Markup).toContain("Альтернатива · больше стабильности");
    expect(top3Markup).toContain("Альтернатива · больше запаса по ширине");
    expect(top3Markup.match(/REASON_board-a/g)).toHaveLength(1);
    expect(top3Markup).toContain("REASON_board-b");
    expect(top3Markup).toContain("REASON_board-c");
    expect(markup).not.toContain("Если выбирать по характеру");
    expect(markup).not.toContain("decision_guide");
    expect(comparisonMarkup.indexOf("Board A")).toBeLessThan(
      comparisonMarkup.indexOf("Board B"),
    );
    expect(comparisonMarkup.indexOf("Board B")).toBeLessThan(
      comparisonMarkup.indexOf("Board C"),
    );
    expect(comparisonMarkup).not.toContain("Board D");
    expect(comparisonMarkup.match(/placement=recommendation_comparison/g)).toHaveLength(3);
    expect(comparisonMarkup).toContain("recommendationRank=1");
    expect(comparisonMarkup).toContain("recommendationRank=2");
    expect(comparisonMarkup).toContain("recommendationRank=3");
  });

  it.each([1, 2, 3])("renders %s canonical choices without placeholders", (count) => {
    const matches = [
      buildMatch("board-a", "Board A", "best-overall", 90),
      buildMatch("board-b", "Board B", "playful", 80),
      buildMatch("board-c", "Board C", "stable", 70),
    ].slice(0, count);
    const markup = renderToStaticMarkup(
      <ResultView
        initialRecommendation={{ ...recommendation, recommendedBoards: matches }}
        mode="saved"
      />,
    );
    const top3Markup = markup.slice(
      markup.indexOf("С чего начать"),
      markup.indexOf("Финальный выбор"),
    );

    expect(top3Markup.match(/Основной выбор · №1/g)).toHaveLength(1);
    expect(top3Markup.match(/Альтернатива ·/g) ?? []).toHaveLength(count - 1);
    expect(markup).toContain("Почему именно эта модель");
    expect(markup).not.toContain("Помогла рекомендация принять решение?");
    expect(markup.includes("Сравнить варианты")).toBe(count >= 2);
    expect(markup.match(/Ориентир цены/g) ?? []).toHaveLength(
      count >= 2 ? count * 2 : count,
    );
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
