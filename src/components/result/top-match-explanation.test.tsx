import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TopMatchExplanation } from "@/components/result/top-match-explanation";
import type { QuizInput, RecommendationMatch } from "@/types/domain";

const input: QuizInput = {
  heightCm: 178,
  weightKg: 74,
  bootSizeEu: 43,
  boardLinePreference: "men",
  skillLevel: "intermediate",
  ridingStyle: "freeride",
  terrainPriority: "soft-snow",
  aggressiveness: "balanced",
  stanceType: "standard",
};

const match: RecommendationMatch = {
  product: {
    id: "product-1",
    slug: "jones-frontier-2-0",
    brand: "Jones",
    modelName: "Frontier 2.0",
    descriptionShort: "Test board",
    descriptionFull: "Test board",
    ridingStyle: "freeride",
    skillLevel: "intermediate",
    flex: 5,
    priceFrom: 60_000,
    imageUrl: "",
    affiliateUrl: "https://traektoria.ru/product/1890649_board/",
    isActive: true,
    boardLine: "men",
    shapeType: "directional",
    camberProfile: "hybrid-camber",
    dataStatus: "verified",
    sourceName: "Traektoria",
    sourceUrl: "https://traektoria.ru/product/1890649_board/",
    sourceCheckedAt: null,
    scenarios: [],
    notIdealFor: [],
    sizes: [],
  },
  size: {
    sizeCm: 156,
    sizeLabel: "156 cm",
    waistWidthMm: 256,
    recommendedWeightMin: 65,
    recommendedWeightMax: 85,
    widthType: "regular",
    isAvailable: true,
  },
  score: 93_741,
  fitLabel: "Высокое совпадение",
  role: "best-overall",
  confidence: "high",
  confidenceLabel: "Высокая уверенность",
  isCatalogReady: true,
  reasons: ["Reason A", "Reason B", "Reason C", "Reason D"],
};

describe("TopMatchExplanation", () => {
  it("connects canonical rider, size and model facts without exposing score", () => {
    const markup = renderToStaticMarkup(
      <TopMatchExplanation input={input} match={match} />,
    );

    expect(markup).toContain("Почему именно эта модель");
    expect(markup).toContain("средний уровень");
    expect(markup).toContain("freeride / powder");
    expect(markup).toContain("мягкий снег и разбитка");
    expect(markup).toContain("74 кг");
    expect(markup).toContain("EU 43");
    expect(markup).toContain("156 · обычная ширина");
    expect(markup).toContain("Талия 256 мм");
    expect(markup).toContain("Рабочий вес 65-85 кг");
    expect(markup).toContain("направленная");
    expect(markup).toContain("гибридный camber");
    expect(markup).toContain("<dl");
    expect(markup).toContain("<ol");
    expect(markup).not.toContain("93741");
    expect(markup).not.toContain("бюджет");
    expect(markup).not.toContain("60 000");
  });

  it("keeps only the first three authoritative reasons in their order", () => {
    const markup = renderToStaticMarkup(
      <TopMatchExplanation input={input} match={match} />,
    );

    expect(markup).toContain("Reason A");
    expect(markup).toContain("Reason B");
    expect(markup).toContain("Reason C");
    expect(markup).not.toContain("Reason D");
    expect(markup.indexOf("Reason A")).toBeLessThan(markup.indexOf("Reason B"));
    expect(markup.indexOf("Reason B")).toBeLessThan(markup.indexOf("Reason C"));
  });

  it("falls back to fitLabel and omits unavailable optional model facts", () => {
    const markup = renderToStaticMarkup(
      <TopMatchExplanation
        input={input}
        match={{
          ...match,
          product: {
            ...match.product,
            shapeType: null,
            camberProfile: null,
          },
          reasons: [],
        }}
      />,
    );

    expect(markup).toContain("Высокое совпадение");
    expect(markup).not.toContain("направленная");
    expect(markup).not.toContain("гибридный camber");
    expect(markup).not.toContain("unknown");
  });
});
