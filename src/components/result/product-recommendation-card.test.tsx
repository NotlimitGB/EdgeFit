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
import { getExactSizeOfferIntelligence } from "@/lib/exact-size-offer";

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
};

function renderCard(
  affiliateUrl: string,
  resultMode: "session" | "saved" = "session",
  budgetRelation:
    | "budget_not_set"
    | "within_catalog_estimate"
    | "over_catalog_estimate"
    | "price_unknown" = "budget_not_set",
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
      offerIntelligence={getExactSizeOfferIntelligence({
        product: currentMatch.product,
        recommendedSize: currentMatch.size,
        resultMode,
      })}
      budgetRelation={budgetRelation}
      resultMode={resultMode}
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
        offerIntelligence={storeAction.offerIntelligence}
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
    expect(markup).toContain(
      "По данным каталога размер 156 отмечен доступным — актуальное наличие проверь в Траектории",
    );
    expect(markup).not.toContain("в наличии сейчас");
    expect(markup).not.toContain("доступен сейчас");
    expect(markup).not.toContain("проверено недавно");
    expect(markup).not.toContain("свежие данные");
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
    expect(markup).toContain("Точного предложения по размеру 156 пока нет");
    expect(markup).not.toContain("jonessnowboards.com");
  });

  it("uses cautious catalog-evidence wording for a direct Trial Sport offer", () => {
    const markup = renderCard(
      "https://trial-sport.ru/goods/1/3131513.html",
    );

    expect(markup).toContain(
      "По данным каталога размер 156 отмечен доступным — актуальное наличие проверь в Trial Sport",
    );
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
    expect(markup).toContain("Наличие размера 156 нужно проверить в магазине");
  });

  it("uses cautious copy when the exact row is not confirmed", () => {
    const unavailableMatch = {
      ...match,
      product: {
        ...match.product,
        sizes: match.product.sizes.map((size) => ({
          ...size,
          isAvailable: false,
        })),
      },
    };
    const offerIntelligence = getExactSizeOfferIntelligence({
      product: unavailableMatch.product,
      recommendedSize: unavailableMatch.size,
    });
    const markup = renderToStaticMarkup(
      <ProductRecommendationCard
        match={unavailableMatch}
        position={1}
        variant="featured"
        shopHref="/go/jones-mountain-twin"
        commercialPresentation={getStoreDestinationPresentation(
          unavailableMatch.product.affiliateUrl,
        )}
        offerIntelligence={offerIntelligence}
      />,
    );

    expect(markup).toContain("Наличие размера 156 не подтверждено");
    expect(markup).not.toContain("По данным каталога размер 156 отмечен доступным");
    expect(markup).not.toContain("Распродано");
  });

  it.each([
    [
      "within_catalog_estimate",
      "По ориентиру каталога цена не выше указанного бюджета.",
    ],
    [
      "over_catalog_estimate",
      "По ориентиру каталога цена выше указанного бюджета.",
    ],
    [
      "price_unknown",
      "Нет надёжного ценового ориентира для сравнения с бюджетом.",
    ],
  ] as const)("renders truthful %s budget copy", (relation, copy) => {
    const markup = renderCard(
      "https://traektoria.ru/product/1_board/",
      "session",
      relation,
    );

    expect(markup).toContain(copy);
    expect(markup).not.toContain("В пределах бюджета");
    expect(markup).not.toContain("Можно купить");
    expect(markup).not.toContain("Самый доступный");
  });

  it("uses historical wording for a saved budget snapshot", () => {
    const markup = renderCard(
      "https://traektoria.ru/product/1_board/",
      "saved",
      "within_catalog_estimate",
    );
    expect(markup).toContain("на момент подбора");
  });
});
