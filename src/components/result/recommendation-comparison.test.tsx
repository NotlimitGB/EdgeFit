import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RecommendationComparisonItem } from "./recommendation-comparison";
import { RecommendationComparison } from "./recommendation-comparison";
import type { RecommendationMatch, RecommendationRole } from "@/types/domain";

function buildMatch(
  id: string,
  modelName: string,
  role: RecommendationRole,
): RecommendationMatch {
  return {
    product: {
      id,
      slug: id,
      brand: "Jones",
      modelName,
      descriptionShort: "Test board",
      descriptionFull: "Test board",
      ridingStyle: "freeride",
      skillLevel: "intermediate",
      flex: 6,
      priceFrom: 63_741,
      imageUrl: "",
      affiliateUrl: "https://traektoria.ru/product/1_board/",
      isActive: true,
      boardLine: "men",
      shapeType: "directional",
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
      sizeLabel: "156W",
      waistWidthMm: 264,
      recommendedWeightMin: 70,
      recommendedWeightMax: 90,
      widthType: "wide",
      isAvailable: true,
    },
    score: 91_827,
    fitLabel: "Точный fit",
    role,
    confidence: "high",
    confidenceLabel: "UNIQUE_CONFIDENCE",
    isCatalogReady: true,
    reasons: ["UNIQUE_REASON_FOR_CARD"],
  };
}

function buildItem(
  id: string,
  modelName: string,
  role: RecommendationRole,
  rank: number,
): RecommendationComparisonItem {
  return {
    match: buildMatch(id, modelName, role),
    rank,
    shopHref: `/go/${id}?placement=recommendation_comparison&recommendationRank=${rank}`,
    shopAnalyticsPayload: {
      placement: "recommendation_comparison",
      recommendation_rank: rank,
    },
    commercialPresentation: {
      mode: "direct",
      merchantLabel: "Траектория",
      actionLabel: "Открыть в Траектории",
      priceLabel: "Ориентир цены",
    },
  };
}

describe("RecommendationComparison", () => {
  it("stays hidden for one recommendation", () => {
    const markup = renderToStaticMarkup(
      <RecommendationComparison
        items={[buildItem("board-a", "Board A", "best-overall", 1)]}
      />,
    );

    expect(markup).toBe("");
  });

  it.each([2, 3])("renders exactly %s canonical candidates", (count) => {
    const items = [
      buildItem("board-a", "Board A", "best-overall", 1),
      buildItem("board-b", "Board B", "stable", 2),
      buildItem("board-c", "Board C", "playful", 3),
    ].slice(0, count);
    const markup = renderToStaticMarkup(
      <RecommendationComparison items={items} />,
    );

    expect(markup).toContain(`data-count="${count}"`);
    expect(markup.match(/<article/g)).toHaveLength(count);
    expect(markup).not.toContain("Board D");
  });

  it("preserves rank order and existing decision cues", () => {
    const markup = renderToStaticMarkup(
      <RecommendationComparison
        items={[
          buildItem("board-a", "Board A", "best-overall", 1),
          buildItem("board-b", "Board B", "stable", 2),
          buildItem("board-c", "Board C", "playful", 3),
        ]}
      />,
    );

    expect(markup.indexOf("Board A")).toBeLessThan(markup.indexOf("Board B"));
    expect(markup.indexOf("Board B")).toBeLessThan(markup.indexOf("Board C"));
    expect(markup).toContain("Основной выбор · №1");
    expect(markup).toContain("Альтернатива · больше стабильности");
    expect(markup).toContain("Альтернатива · более живой вариант");
    expect(markup).toContain("№1");
    expect(markup).toContain("№2");
    expect(markup).toContain("№3");
  });

  it("uses canonical formatters and truthful product-level price copy", () => {
    const markup = renderToStaticMarkup(
      <RecommendationComparison
        items={[
          buildItem("board-a", "Board A", "best-overall", 1),
          buildItem("board-b", "Board B", "stable", 2),
        ]}
      />,
    );

    expect(markup).toContain("156W");
    expect(markup).toContain("wide · талия 264 мм");
    expect(markup).toContain("70-90 кг");
    expect(markup).toContain("freeride / powder");
    expect(markup).toContain("направленная");
    expect(markup).toContain("гибридный camber");
    expect(markup).toContain("63 741 ₽");
    expect(markup).toContain("Ориентир цены");
    expect(markup).toContain("ориентир из каталога");
    expect(markup).toContain("не подтверждённая текущая цена конкретной ростовки");
    expect(markup).not.toContain("можно купить за");
    expect(markup).not.toContain("цена этой ростовки");
  });

  it("shows aligned missing catalog values without exposing score or reasons", () => {
    const first = buildItem("board-a", "Board A", "best-overall", 1);
    first.match = {
      ...first.match,
      product: {
        ...first.match.product,
        shapeType: null,
        camberProfile: null,
      },
    };

    const markup = renderToStaticMarkup(
      <RecommendationComparison
        items={[first, buildItem("board-b", "Board B", "stable", 2)]}
      />,
    );

    expect(markup.match(/нет данных в каталоге/g)).toHaveLength(2);
    expect(markup).not.toContain("91827");
    expect(markup).not.toContain("UNIQUE_CONFIDENCE");
    expect(markup).not.toContain("UNIQUE_REASON_FOR_CARD");
  });

  it("keeps comparison store placement and rendered ranks in links", () => {
    const markup = renderToStaticMarkup(
      <RecommendationComparison
        items={[
          buildItem("board-a", "Board A", "best-overall", 1),
          buildItem("board-b", "Board B", "stable", 2),
          buildItem("board-c", "Board C", "playful", 3),
        ]}
      />,
    );

    expect(markup).toContain(
      "placement=recommendation_comparison&amp;recommendationRank=1",
    );
    expect(markup).toContain(
      "placement=recommendation_comparison&amp;recommendationRank=2",
    );
    expect(markup).toContain(
      "placement=recommendation_comparison&amp;recommendationRank=3",
    );
  });
});
