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
  recommendedBoards: [],
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
  });
});
