import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RecommendationMatch } from "@/types/domain";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/analytics/tracked-store-link", () => ({
  TrackedStoreLink: ({
    analyticsPayload,
    children,
    ...props
  }: React.ComponentProps<"a"> & {
    analyticsPayload?: Record<string, unknown>;
  }) => (
    <a
      {...props}
      data-analytics={
        analyticsPayload ? JSON.stringify(analyticsPayload) : undefined
      }
    >
      {children}
    </a>
  ),
}));

import { ProductRecommendationCard } from "@/components/result/product-recommendation-card";
import { buildResultStoreClickAction } from "@/components/result/result-view";
import { getStoreDestinationPresentation } from "@/lib/store-redirect";

const match: RecommendationMatch = {
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
};

function renderCard(
  affiliateUrl: string,
  resultMode: "session" | "saved" = "session",
) {
  const currentMatch = {
    ...match,
    product: { ...match.product, affiliateUrl },
  };

  return renderToStaticMarkup(
    <ProductRecommendationCard
      match={currentMatch}
      position={1}
      variant="featured"
      shopHref="/go/jones-mountain-twin?from=result-top"
      shopAnalyticsPayload={
        resultMode === "session"
          ? { board_slug: "jones-mountain-twin", placement: "recommended" }
          : undefined
      }
      commercialPresentation={getStoreDestinationPresentation(
        affiliateUrl,
        resultMode,
      )}
    />,
  );
}

describe("ProductRecommendationCard commercial presentation", () => {
  it("renders the exact result provenance on the merchant CTA", () => {
    const storeAction = buildResultStoreClickAction({
      match,
      source: "result-top",
      placement: "primary_recommendation",
      recommendationRank: 1,
      algorithmVersion: "v1.6.4",
      isSavedMode: false,
    });
    const markup = renderToStaticMarkup(
      <ProductRecommendationCard
        match={match}
        position={1}
        variant="featured"
        shopHref={storeAction.href}
        shopAnalyticsPayload={storeAction.analyticsPayload}
        commercialPresentation={getStoreDestinationPresentation(
          match.product.affiliateUrl,
        )}
      />,
    );

    expect(markup).toContain("primary_recommendation");
    expect(markup).toContain("product-1");
    expect(markup).toContain("jones-mountain-twin");
    expect(markup).toContain("source_product_id");
    expect(markup).toContain("recommendationRank=1");
  });

  it("shows a supported direct merchant with cautious price semantics", () => {
    const markup = renderCard("https://traektoria.ru/product/1_board/");

    expect(markup).toContain("Открыть в Траектории");
    expect(markup).toContain("Ориентир цены");
    expect(markup).toContain("Актуальные цену и наличие проверь в магазине.");
    expect(markup).not.toContain("Цена от");
    expect(markup).toContain(
      'href="/go/jones-mountain-twin?from=result-top"',
    );
    expect(markup).toContain("board_slug");
    expect(markup).toContain("jones-mountain-twin");
  });

  it("makes the existing Trial Sport search fallback explicit", () => {
    const markup = renderCard("https://www.jonessnowboards.com/model");

    expect(markup).toContain("Искать в Trial Sport");
    expect(markup).toContain("Откроется поиск модели в магазине.");
    expect(markup).not.toContain("jonessnowboards.com");
  });

  it("uses generic commerce wording for immutable saved results", () => {
    const markup = renderCard(
      "https://traektoria.ru/product/1_board/",
      "saved",
    );

    expect(markup).toContain("Проверить в магазине");
    expect(markup).not.toContain("Траектория");
    expect(markup).not.toContain("Актуальные цену и наличие");
    expect(markup).not.toContain("data-analytics");
  });
});
