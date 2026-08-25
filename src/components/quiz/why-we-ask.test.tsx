import type { ReactElement, ToggleEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createQuizQuestionHelpTracker,
  quizQuestionExplanations,
  WhyWeAsk,
  type QuizQuestionField,
} from "@/components/quiz/why-we-ask";

const expectedExplanationPhrases = {
  heightCm: "Вес задаёт основу диапазона ростовки",
  weightKg: "Вес — главный ориентир для рабочей длины",
  bootSizeEu: "снизить риск цеплять снег носком или пяткой",
  stanceType: "немного влияет на необходимый запас по ширине",
  skillLevel: "не советовать слишком требовательную доску",
  ridingStyle: "Основной стиль задаёт тип досок",
  terrainPriority: "фристайл, карвинг, мягкий снег или универсальность",
  aggressiveness: "более лёгкая в управлении доска",
  boardLinePreference: "Ростовку и ширину она не меняет",
  budgetMaxRub: "Бюджет не меняет подбор и порядок моделей",
} as const satisfies Record<QuizQuestionField, string>;

describe("WhyWeAsk", () => {
  it("defines truthful help for every current quiz question", () => {
    expect(Object.keys(quizQuestionExplanations)).toEqual(
      Object.keys(expectedExplanationPhrases),
    );

    for (const [fieldName, phrase] of Object.entries(
      expectedExplanationPhrases,
    ) as [QuizQuestionField, string][]) {
      expect(quizQuestionExplanations[fieldName].text).toContain(phrase);
    }

    expect(quizQuestionExplanations.heightCm.text).not.toMatch(
      /рост (?:задаёт|определяет) (?:основу |)ростов/u,
    );
    expect(quizQuestionExplanations.stanceType.text).toContain("немного");
    expect(quizQuestionExplanations.boardLinePreference.text).not.toMatch(
      /фильтр|фильтру/u,
    );
    expect(quizQuestionExplanations.budgetMaxRub.text).not.toMatch(
      /в пределах бюджета|можно купить|подберём .*бюджет/u,
    );
  });

  it("renders an accessible native disclosure collapsed by default", () => {
    const markup = renderToStaticMarkup(
      <WhyWeAsk
        fieldName="heightCm"
        questionLabel="Рост"
        onOpen={vi.fn()}
      />,
    );

    expect(markup).toContain("<details");
    expect(markup).toContain('data-question-field="heightCm"');
    expect(markup).toContain("Почему это важно?</summary>");
    expect(markup).toContain('aria-label="Почему важен вопрос «Рост»?"');
    expect(markup).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/u);
    expect(markup).toContain(quizQuestionExplanations.heightCm.text);
  });

  it("emits only the first opening per field without answer values", () => {
    const emit = vi.fn();
    const tracker = createQuizQuestionHelpTracker(emit);
    const heightDisclosure = WhyWeAsk({
      fieldName: "heightCm",
      questionLabel: "Рост",
      onOpen: tracker.open,
    }) as ReactElement<{
      onToggle: (event: ToggleEvent<HTMLDetailsElement>) => void;
    }>;
    const weightDisclosure = WhyWeAsk({
      fieldName: "weightKg",
      questionLabel: "Вес",
      onOpen: tracker.open,
    }) as ReactElement<{
      onToggle: (event: ToggleEvent<HTMLDetailsElement>) => void;
    }>;

    heightDisclosure.props.onToggle({
      currentTarget: { open: true },
    } as ToggleEvent<HTMLDetailsElement>);
    heightDisclosure.props.onToggle({
      currentTarget: { open: false },
    } as ToggleEvent<HTMLDetailsElement>);
    heightDisclosure.props.onToggle({
      currentTarget: { open: true },
    } as ToggleEvent<HTMLDetailsElement>);
    weightDisclosure.props.onToggle({
      currentTarget: { open: true },
    } as ToggleEvent<HTMLDetailsElement>);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, "quiz_question_help_opened", {
      quiz_version: "v2",
      step_key: "physical_fit",
      field_name: "heightCm",
    });
    expect(emit).toHaveBeenNthCalledWith(2, "quiz_question_help_opened", {
      quiz_version: "v2",
      step_key: "physical_fit",
      field_name: "weightKg",
    });
    expect(Object.keys(emit.mock.calls[0][1])).toEqual([
      "quiz_version",
      "step_key",
      "field_name",
    ]);
  });
});
