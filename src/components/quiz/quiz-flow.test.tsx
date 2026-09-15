// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRecommendationRequestPayload,
  QuizFlow,
  buildQuizCompletionAnalyticsPayload,
  QuizFlowStepFields,
} from "@/components/quiz/quiz-flow";
import type { QuizSubmission } from "@/lib/quiz/schema";
import {
  createQuizV2Draft,
  saveQuizV2Draft,
} from "@/lib/quiz/draft";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  trackEvent: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("@/lib/analytics/client", () => ({
  trackEvent: mocks.trackEvent,
}));

const SESSION_STORAGE_KEY = "edgefit.session-id";
const FIRST_INTERACTION_MARKER = "edgefit:quiz-first-interaction:v2";

function analyticsCalls(eventName: string) {
  return mocks.trackEvent.mock.calls.filter(([name]) => name === eventName);
}

async function waitForInitialAnalytics() {
  await waitFor(() => {
    expect(analyticsCalls("quiz_started")).toHaveLength(1);
    expect(analyticsCalls("quiz_step_viewed")).toHaveLength(1);
  });
}

function fillPhysicalStep() {
  fireEvent.change(screen.getByLabelText("Рост"), {
    target: { value: "178" },
  });
  fireEvent.change(screen.getByLabelText("Вес"), {
    target: { value: "74" },
  });
  fireEvent.change(screen.getByLabelText("Размер ботинка"), {
    target: { value: "43" },
  });
  fireEvent.click(screen.getByRole("radio", { name: /Стандартная/u }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, "session-1");
  mocks.routerPush.mockReset();
  mocks.trackEvent.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

describe("focused board quiz context", () => {
  const submission: QuizSubmission = {
    heightCm: 178,
    weightKg: 74,
    bootSizeEu: 43,
    stanceType: "standard",
    skillLevel: "intermediate",
    ridingStyle: "all-mountain",
    terrainPriority: "balanced",
    aggressiveness: "balanced",
    boardLinePreference: "any",
  };

  it("shows the selected canonical board before the questions", () => {
    const markup = renderToStaticMarkup(
      <QuizFlow
        focusedBoard={{
          slug: "jones-mountain-twin",
          brand: "Jones",
          modelName: "Mountain Twin",
        }}
      />,
    );

    expect(markup).toContain("Сейчас проверяем");
    expect(markup).toContain("Jones Mountain Twin");
    expect(markup).toContain(
      "После квиза сначала разберём именно эту модель.",
    );
  });

  it("submits a focused slug only when canonical context exists", () => {
    expect(
      buildRecommendationRequestPayload(submission, { budgetMaxRub: null }),
    ).toEqual({ ...submission, purchasePreferences: { budgetMaxRub: null } });
    expect(
      buildRecommendationRequestPayload(
        submission,
        { budgetMaxRub: null },
        {
          slug: "jones-mountain-twin",
          brand: "Jones",
          modelName: "Mountain Twin",
        },
      ),
    ).toMatchObject({ focusedBoardSlug: "jones-mountain-twin" });
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

describe("Quiz v2 entry telemetry", () => {
  it("keeps quiz_started mount-based without treating mount as interaction", async () => {
    render(<QuizFlow />);

    await waitForInitialAnalytics();

    expect(analyticsCalls("quiz_first_interaction")).toHaveLength(0);
    expect(window.sessionStorage.getItem(FIRST_INTERACTION_MARKER)).toBeNull();
  });

  it("does not emit an interaction while hydrating a stored draft", async () => {
    saveQuizV2Draft(window.sessionStorage, {
      ...createQuizV2Draft(),
      heightCm: "181",
      stanceType: "duck",
    });

    render(<QuizFlow />);

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Рост") as HTMLInputElement).value,
      ).toBe("181");
    });
    expect(analyticsCalls("quiz_first_interaction")).toHaveLength(0);
    expect(window.sessionStorage.getItem(FIRST_INTERACTION_MARKER)).toBeNull();
  });

  it("emits a private generic payload on the first number change only", async () => {
    render(<QuizFlow />);
    await waitForInitialAnalytics();

    fireEvent.change(screen.getByLabelText("Рост"), {
      target: { value: "178" },
    });
    fireEvent.change(screen.getByLabelText("Вес"), {
      target: { value: "74" },
    });

    expect(analyticsCalls("quiz_first_interaction")).toEqual([
      [
        "quiz_first_interaction",
        {
          quiz_version: "v2",
          step_key: "physical_fit",
          step_number: 1,
          entry_mode: "generic",
        },
      ],
    ]);
    expect(window.sessionStorage.getItem(FIRST_INTERACTION_MARKER)).toBe(
      "session-1",
    );
  });

  it("emits focused entry mode on the first choice selection", async () => {
    render(
      <QuizFlow
        focusedBoard={{
          slug: "jones-mountain-twin",
          brand: "Jones",
          modelName: "Mountain Twin",
        }}
      />,
    );
    await waitForInitialAnalytics();

    fireEvent.click(screen.getByRole("radio", { name: /Стандартная/u }));

    expect(analyticsCalls("quiz_first_interaction")).toEqual([
      [
        "quiz_first_interaction",
        {
          quiz_version: "v2",
          step_key: "physical_fit",
          step_number: 1,
          entry_mode: "focused",
        },
      ],
    ]);
  });

  it("deduplicates across remounts for the same analytics session", async () => {
    const firstRender = render(<QuizFlow />);
    await waitForInitialAnalytics();
    fireEvent.change(screen.getByLabelText("Рост"), {
      target: { value: "178" },
    });
    firstRender.unmount();

    render(<QuizFlow />);
    await waitFor(() => {
      expect(analyticsCalls("quiz_started")).toHaveLength(2);
    });
    fireEvent.change(screen.getByLabelText("Вес"), {
      target: { value: "75" },
    });

    expect(analyticsCalls("quiz_first_interaction")).toHaveLength(1);
  });

  it("allows the next analytics session to claim the versioned marker", async () => {
    const firstRender = render(<QuizFlow />);
    await waitForInitialAnalytics();
    fireEvent.change(screen.getByLabelText("Рост"), {
      target: { value: "178" },
    });
    firstRender.unmount();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, "session-2");

    render(<QuizFlow />);
    await waitFor(() => {
      expect(analyticsCalls("quiz_started")).toHaveLength(2);
    });
    fireEvent.change(screen.getByLabelText("Вес"), {
      target: { value: "75" },
    });

    expect(analyticsCalls("quiz_first_interaction")).toHaveLength(2);
    expect(window.sessionStorage.getItem(FIRST_INTERACTION_MARKER)).toBe(
      "session-2",
    );
  });

  it("keeps answer changes usable when the interaction marker cannot be stored", async () => {
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      key,
      value,
    ) {
      if (key === FIRST_INTERACTION_MARKER) {
        throw new DOMException("Storage unavailable");
      }
      return nativeSetItem.call(this, key, value);
    });
    render(<QuizFlow />);
    await waitForInitialAnalytics();

    const heightInput = screen.getByLabelText("Рост") as HTMLInputElement;
    fireEvent.change(heightInput, { target: { value: "178" } });

    expect(heightInput.value).toBe("178");
    expect(analyticsCalls("quiz_first_interaction")).toHaveLength(0);
  });

  it("tracks every failed forward attempt with only an error count", async () => {
    render(<QuizFlow />);
    await waitForInitialAnalytics();
    const nextButton = screen.getByRole("button", { name: /Продолжить/u });

    fireEvent.click(nextButton);
    fireEvent.change(screen.getByLabelText("Рост"), {
      target: { value: "178" },
    });
    fireEvent.click(nextButton);

    expect(analyticsCalls("quiz_step_validation_failed")).toEqual([
      [
        "quiz_step_validation_failed",
        {
          quiz_version: "v2",
          step_key: "physical_fit",
          step_number: 1,
          entry_mode: "generic",
          error_field_count: 4,
        },
      ],
      [
        "quiz_step_validation_failed",
        {
          quiz_version: "v2",
          step_key: "physical_fit",
          step_number: 1,
          entry_mode: "generic",
          error_field_count: 3,
        },
      ],
    ]);
  });

  it("keeps successful navigation free of validation failures", async () => {
    render(<QuizFlow />);
    await waitForInitialAnalytics();
    fillPhysicalStep();

    fireEvent.click(screen.getByRole("button", { name: /Продолжить/u }));

    await waitFor(() => {
      expect(analyticsCalls("quiz_step_completed")).toContainEqual([
        "quiz_step_completed",
        expect.objectContaining({ step_key: "physical_fit" }),
      ]);
    });
    expect(analyticsCalls("quiz_step_validation_failed")).toHaveLength(0);
  });

  it("preserves final-step completion and quiz completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          headers: new Headers(),
          json: async () => ({
            recommendedWidthType: "regular",
            bootDragRisk: "low",
          }),
        }) as Response,
      ),
    );
    render(<QuizFlow />);
    await waitForInitialAnalytics();
    fillPhysicalStep();
    fireEvent.click(screen.getByRole("button", { name: /Продолжить/u }));

    await screen.findByText("Теперь уточним твой опыт и сценарий катания");
    fireEvent.click(screen.getByRole("radio", { name: /Уверенно катаюсь/u }));
    fireEvent.click(screen.getByRole("radio", { name: /^All-mountain/u }));
    fireEvent.click(screen.getByRole("radio", { name: /^Универсальность/u }));
    fireEvent.click(screen.getByRole("button", { name: /Продолжить/u }));

    await screen.findByText("Осталось уточнить характер, линейку и бюджет");
    fireEvent.click(screen.getByRole("radio", { name: /^Сбалансированный/u }));
    fireEvent.click(screen.getByRole("button", { name: /Получить подбор/u }));

    await waitFor(() => {
      expect(analyticsCalls("quiz_step_completed")).toContainEqual([
        "quiz_step_completed",
        expect.objectContaining({ step_key: "decision_preferences" }),
      ]);
      expect(analyticsCalls("quiz_completed")).toHaveLength(1);
      expect(mocks.routerPush).toHaveBeenCalledWith("/result");
    });
    expect(analyticsCalls("quiz_step_validation_failed")).toHaveLength(0);
  });
});
