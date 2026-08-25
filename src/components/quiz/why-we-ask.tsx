"use client";

import type { ToggleEvent } from "react";
import type { QuizStepKey } from "@/lib/analytics/quiz-progression";
import { QUIZ_VERSION } from "@/lib/analytics/quiz-progression";
import type { QuizV2Draft } from "@/lib/quiz/draft";
import styles from "./quiz-flow.module.css";

export type QuizQuestionField = keyof QuizV2Draft;

interface QuizQuestionExplanation {
  stepKey: QuizStepKey;
  text: string;
}

export const quizQuestionExplanations = {
  heightCm: {
    stepKey: "physical_fit",
    text: "Вес задаёт основу диапазона ростовки, а рост помогает немного его скорректировать.",
  },
  weightKg: {
    stepKey: "physical_fit",
    text: "Вес — главный ориентир для рабочей длины. Также сверяем, подходит ли конкретная ростовка под твой вес.",
  },
  bootSizeEu: {
    stepKey: "physical_fit",
    text: "Размер ботинка нужен, чтобы подобрать достаточную ширину доски и снизить риск цеплять снег носком или пяткой.",
  },
  stanceType: {
    stepKey: "physical_fit",
    text: "Стойка немного влияет на необходимый запас по ширине и оценку риска зацепа ботинком.",
  },
  skillLevel: {
    stepKey: "riding_context",
    text: "Уровень помогает не советовать слишком требовательную доску и подобрать подходящий характер жёсткости и управления.",
  },
  ridingStyle: {
    stepKey: "riding_context",
    text: "Основной стиль задаёт тип досок, которые лучше соответствуют твоему катанию, и немного корректирует рабочую длину.",
  },
  terrainPriority: {
    stepKey: "riding_context",
    text: "Приоритет уточняет, что для тебя важнее: фристайл, карвинг, мягкий снег или универсальность. Это помогает точнее выбрать характер, форму и параметры доски.",
  },
  aggressiveness: {
    stepKey: "decision_preferences",
    text: "Характер катания помогает понять, нужна более лёгкая в управлении доска или больше поддержки и стабильности.",
  },
  boardLinePreference: {
    stepKey: "decision_preferences",
    text: "Линейка влияет только на приоритет подходящих моделей в выдаче. Ростовку и ширину она не меняет.",
  },
  budgetMaxRub: {
    stepKey: "decision_preferences",
    text: "Бюджет не меняет подбор и порядок моделей. Мы только сравним его с ориентиром цены каталога; актуальную цену нужно проверить в магазине.",
  },
} as const satisfies Record<QuizQuestionField, QuizQuestionExplanation>;

export interface QuizQuestionHelpPayload extends Record<string, unknown> {
  quiz_version: typeof QUIZ_VERSION;
  step_key: QuizStepKey;
  field_name: QuizQuestionField;
}

type QuizQuestionHelpEmitter = (
  eventName: "quiz_question_help_opened",
  payload: QuizQuestionHelpPayload,
) => void;

export function createQuizQuestionHelpTracker(
  emit: QuizQuestionHelpEmitter,
) {
  const openedFields = new Set<QuizQuestionField>();

  return {
    open(fieldName: QuizQuestionField) {
      if (openedFields.has(fieldName)) {
        return false;
      }

      openedFields.add(fieldName);
      emit("quiz_question_help_opened", {
        quiz_version: QUIZ_VERSION,
        step_key: quizQuestionExplanations[fieldName].stepKey,
        field_name: fieldName,
      });
      return true;
    },
  };
}

export function WhyWeAsk({
  fieldName,
  questionLabel,
  onOpen,
}: {
  fieldName: QuizQuestionField;
  questionLabel: string;
  onOpen: (fieldName: QuizQuestionField) => void;
}) {
  const explanation = quizQuestionExplanations[fieldName];

  function handleToggle(event: ToggleEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open) {
      onOpen(fieldName);
    }
  }

  return (
    <details
      className={styles.whyWeAsk}
      data-question-field={fieldName}
      onToggle={handleToggle}
    >
      <summary aria-label={`Почему важен вопрос «${questionLabel}»?`}>
        Почему это важно?
      </summary>
      <p>{explanation.text}</p>
    </details>
  );
}
