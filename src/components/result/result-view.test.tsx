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

import { ResultView } from "@/components/result/result-view";

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
