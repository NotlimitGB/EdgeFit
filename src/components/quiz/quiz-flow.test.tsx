import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildQuizCompletionAnalyticsPayload,
  QuizFlowStepFields,
} from "@/components/quiz/quiz-flow";
import { createQuizV2Draft } from "@/lib/quiz/draft";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Quiz v2 rendered fields", () => {
  const draft = createQuizV2Draft();
  const onChange = vi.fn();
  const onHelpOpened = vi.fn();

  it("renders blank physical inputs followed by unanswered stance", () => {
    const markup = renderToStaticMarkup(
      <QuizFlowStepFields
        stepKey="physical_fit"
        draft={draft}
        errors={{}}
        onChange={onChange}
        onHelpOpened={onHelpOpened}
      />,
    );

    expect(markup.indexOf('name="heightCm"')).toBeLessThan(
      markup.indexOf('name="weightKg"'),
    );
    expect(markup.indexOf('name="weightKg"')).toBeLessThan(
      markup.indexOf('name="bootSizeEu"'),
    );
    expect(markup.indexOf('name="bootSizeEu"')).toBeLessThan(
      markup.indexOf('name="stanceType"'),
    );
    expect(markup).toMatch(
      /<input[^>]*type="number"[^>]*name="heightCm"[^>]*value=""/u,
    );
    expect(markup).toMatch(
      /<input[^>]*type="number"[^>]*name="weightKg"[^>]*value=""/u,
    );
    expect(markup).toMatch(
      /<input[^>]*type="number"[^>]*name="bootSizeEu"[^>]*value=""/u,
    );
    expect(markup).not.toMatch(/name="stanceType"[^>]*checked/u);
    expect(markup).toContain("Не знаю");
  });

  it("renders riding context in the accepted order without defaults", () => {
    const markup = renderToStaticMarkup(
      <QuizFlowStepFields
        stepKey="riding_context"
        draft={draft}
        errors={{}}
        onChange={onChange}
        onHelpOpened={onHelpOpened}
      />,
    );

    expect(markup.indexOf('name="skillLevel"')).toBeLessThan(
      markup.indexOf('name="ridingStyle"'),
    );
    expect(markup.indexOf('name="ridingStyle"')).toBeLessThan(
      markup.indexOf('name="terrainPriority"'),
    );
    expect(markup).not.toMatch(/name="skillLevel"[^>]*checked/u);
    expect(markup).not.toMatch(/name="ridingStyle"[^>]*checked/u);
    expect(markup).not.toMatch(/name="terrainPriority"[^>]*checked/u);
  });

  it("keeps neutral board line selected after aggressiveness", () => {
    const markup = renderToStaticMarkup(
      <QuizFlowStepFields
        stepKey="decision_preferences"
        draft={draft}
        errors={{}}
        onChange={onChange}
        onHelpOpened={onHelpOpened}
      />,
    );

    expect(markup.indexOf('name="aggressiveness"')).toBeLessThan(
      markup.indexOf('name="boardLinePreference"'),
    );
    expect(markup.indexOf('name="boardLinePreference"')).toBeLessThan(
      markup.indexOf('name="budgetMaxRub"'),
    );
    expect(markup).not.toMatch(/name="aggressiveness"[^>]*checked/u);
    expect(markup).toMatch(
      /name="boardLinePreference" checked="" value="any"/u,
    );
    expect(markup).toContain("«Без привязки» — нейтральный вариант.");
    expect(markup).toContain(
      "Не даём линейке дополнительный приоритет и смотрим прежде всего на твои параметры и стиль катания.",
    );
    expect(markup).not.toContain("Это фильтр каталога");
    expect(markup).toContain("Максимальный бюджет");
    expect(markup).toContain("Бюджет не меняет подбор и порядок моделей.");
    expect(markup).toMatch(
      /<input[^>]*type="number"[^>]*name="budgetMaxRub"[^>]*value=""/u,
    );
  });
});

describe("Quiz v2 completion analytics", () => {
  it("adds normalized budget context without changing rider fields", () => {
    const payload = buildQuizCompletionAnalyticsPayload(
      {
        heightCm: 178,
        weightKg: 74,
        bootSizeEu: 43,
        stanceType: "unknown",
        skillLevel: "intermediate",
        ridingStyle: "all-mountain",
        terrainPriority: "balanced",
        aggressiveness: "balanced",
        boardLinePreference: "any",
      },
      { recommendedWidthType: "regular", bootDragRisk: "low" },
      { budgetMaxRub: 60_000 },
    );

    expect(payload).toMatchObject({
      quiz_version: "v2",
      budget_set: true,
      budget_max_rub: 60_000,
      riding_style: "all-mountain",
      result_width_type: "regular",
    });
  });
});
