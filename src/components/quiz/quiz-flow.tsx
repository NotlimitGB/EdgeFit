"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import publicStyles from "@/components/public/public-ui.module.css";
import { trackEvent } from "@/lib/analytics/client";
import {
  defaultQuizDraft,
  quizSubmissionSchema,
  type QuizSubmission,
} from "@/lib/quiz/schema";
import { getOrCreateSessionId } from "@/lib/session-id";
import styles from "./quiz-flow.module.css";

const STORAGE_KEY = "edgefit.quiz-draft";
const RESULT_STORAGE_KEY = "edgefit.latest-recommendation";

const stepFields = [
  ["heightCm", "weightKg", "bootSizeEu"],
  ["boardLinePreference", "skillLevel"],
  ["ridingStyle", "terrainPriority", "aggressiveness", "stanceType"],
] as const;
const stepNames = ["body", "profile", "style"] as const;

const stepDetails = [
  {
    shortLabel: "Параметры",
    eyebrow: "Твои параметры",
    title: "Начнём с того, что реально влияет на размер",
    description:
      "Рост и вес помогают определить рабочую длину, а размер ботинка — безопасную ширину доски.",
    context:
      "Вес задаёт основу ростовки, рост уточняет диапазон, а ботинок определяет нужный запас по ширине.",
  },
  {
    shortLabel: "Профиль",
    eyebrow: "Твой профиль",
    title: "Уровень и предпочтение по линейке",
    description:
      "Уровень влияет на характер подходящих моделей. Линейка фильтрует каталог, но не меняет твой физический fit.",
    context:
      "Здесь мы отделяем физические параметры райдера от того, в какой части каталога искать подходящие модели.",
  },
  {
    shortLabel: "Катание",
    eyebrow: "Как ты катаешься",
    title: "Осталось понять характер и сценарий катания",
    description:
      "Стиль, приоритет и стойка помогают уточнить длину, ширину и профиль доски.",
    context:
      "Стиль задаёт общее направление, а приоритет объясняет, что важнее именно внутри твоего сценария.",
  },
] as const;

type DraftState = Record<keyof QuizSubmission, string>;

interface ChoiceOption<Value extends string> {
  value: Value;
  title: string;
  description: string;
}

const boardLineOptions = [
  {
    value: "men",
    title: "Мужская / унисекс",
    description:
      "Сначала ищем модели из этой линейки. Размер и ширину всё равно считаем по твоим параметрам.",
  },
  {
    value: "women",
    title: "Женская",
    description:
      "Сначала ищем модели из женской линейки. Физический fit остаётся персональным.",
  },
  {
    value: "any",
    title: "Без привязки",
    description:
      "Не ограничиваем каталог линейкой и смотрим прежде всего на fit.",
  },
] as const satisfies readonly ChoiceOption<
  QuizSubmission["boardLinePreference"]
>[];

const skillOptions = [
  {
    value: "beginner",
    title: "Осваиваю базу",
    description: "Хочу более понятную и прощающую доску.",
  },
  {
    value: "intermediate",
    title: "Уверенно катаюсь",
    description: "Нужен баланс контроля, прогресса и стабильности.",
  },
  {
    value: "advanced",
    title: "Катаюсь технично",
    description:
      "Можно рассматривать более требовательные и поддерживающие модели.",
  },
] as const satisfies readonly ChoiceOption<QuizSubmission["skillLevel"]>[];

const ridingStyleOptions = [
  {
    value: "all-mountain",
    title: "All-mountain",
    description: "Трассы, немного вне трасс и разные условия в течение дня.",
  },
  {
    value: "park",
    title: "Park / freestyle",
    description: "Фигуры, прыжки, свич и более живое ощущение доски.",
  },
  {
    value: "freeride",
    title: "Freeride / powder",
    description: "Скорость, рельеф и больше времени вне подготовленных трасс.",
  },
] as const satisfies readonly ChoiceOption<QuizSubmission["ridingStyle"]>[];

const terrainPriorityOptions = [
  {
    value: "balanced",
    title: "Универсальность",
    description: "Одна доска на разные сценарии без сильного перекоса.",
  },
  {
    value: "switch-freestyle",
    title: "Фристайл / свич",
    description:
      "Свич, вращения, side hits и более живое ощущение доски.",
  },
  {
    value: "groomers-carving",
    title: "Карвинг / подготовленные трассы",
    description:
      "Резаные дуги, скорость и сильная закантовка. Оставим дополнительный запас по ширине против зацепа ботинком.",
  },
  {
    value: "soft-snow",
    title: "Мягкий снег / разбитка",
    description: "Больше запаса в мягком снегу, каше и разбитом рельефе.",
  },
] as const satisfies readonly ChoiceOption<
  QuizSubmission["terrainPriority"]
>[];

const aggressivenessOptions = [
  {
    value: "relaxed",
    title: "Спокойный",
    description: "Комфорт, лёгкое управление и больше прощения.",
  },
  {
    value: "balanced",
    title: "Сбалансированный",
    description: "Ровный баланс манёвренности, контроля и стабильности.",
  },
  {
    value: "aggressive",
    title: "Агрессивный",
    description: "Больше стабильности и поддержки на скорости.",
  },
] as const satisfies readonly ChoiceOption<
  QuizSubmission["aggressiveness"]
>[];

const stanceOptions = [
  {
    value: "standard",
    title: "Стандартная",
    description: "Обычная направленная стойка без сильного разворота наружу.",
  },
  {
    value: "duck",
    title: "Duck stance",
    description: "Носки развёрнуты в разные стороны — часто удобно для свича.",
  },
  {
    value: "unknown",
    title: "Не знаю",
    description: "Это нормально — EdgeFit оставит более осторожную оценку.",
  },
] as const satisfies readonly ChoiceOption<QuizSubmission["stanceType"]>[];

const resultOutputs = [
  ["01", "Ростовка", "рабочий диапазон длины"],
  ["02", "Ширина", "regular, mid-wide или wide"],
  ["03", "Талия", "ориентир в миллиметрах"],
  ["04", "Boot drag", "понятный уровень риска"],
  ["05", "Модели", "варианты для сравнения"],
] as const;

function createInitialDraft(): DraftState {
  return {
    heightCm: String(defaultQuizDraft.heightCm),
    weightKg: String(defaultQuizDraft.weightKg),
    bootSizeEu: String(defaultQuizDraft.bootSizeEu),
    boardLinePreference: defaultQuizDraft.boardLinePreference,
    skillLevel: defaultQuizDraft.skillLevel,
    ridingStyle: defaultQuizDraft.ridingStyle,
    terrainPriority: defaultQuizDraft.terrainPriority,
    aggressiveness: defaultQuizDraft.aggressiveness,
    stanceType: defaultQuizDraft.stanceType,
  };
}

export function QuizFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<DraftState>(createInitialDraft);
  const [errors, setErrors] = useState<
    Partial<Record<keyof QuizSubmission, string>>
  >({});
  const [submissionError, setSubmissionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const isInitialStep = useRef(true);
  const isBusy = isSubmitting || isPending;
  const currentStep = stepDetails[step];

  useEffect(() => {
    const rawDraft = window.sessionStorage.getItem(STORAGE_KEY);

    if (!rawDraft) {
      return;
    }

    try {
      const parsedDraft = JSON.parse(rawDraft) as DraftState;
      setDraft((current) => ({ ...current, ...parsedDraft }));
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    getOrCreateSessionId();
    void trackEvent("quiz_started");
  }, []);

  useEffect(() => {
    void trackEvent("quiz_step_viewed", {
      step_name: stepNames[step],
      step_number: step + 1,
    });
  }, [step]);

  useEffect(() => {
    if (isInitialStep.current) {
      isInitialStep.current = false;
      return;
    }

    stepHeadingRef.current?.focus();
  }, [step]);

  function updateDraft<Key extends keyof DraftState>(
    key: Key,
    value: DraftState[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateCurrentStep() {
    const result = quizSubmissionSchema.safeParse(draft);

    if (result.success) {
      setErrors({});
      return result.data;
    }

    const nextErrors = result.error.flatten().fieldErrors;
    const fields = stepFields[step];
    const scopedErrors = fields.reduce<
      Partial<Record<keyof QuizSubmission, string>>
    >((accumulator, field) => {
      const message = nextErrors[field]?.[0];
      if (message) {
        accumulator[field] = message;
      }
      return accumulator;
    }, {});

    setErrors((current) => ({ ...current, ...scopedErrors }));
    return null;
  }

  async function handleSubmit() {
    if (isBusy) {
      return;
    }

    const payload = validateCurrentStep();

    if (!payload) {
      return;
    }

    setSubmissionError("");
    setIsSubmitting(true);

    try {
      const идентификаторСессии = getOrCreateSessionId();
      const response = await fetch("/api/recommendation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-edgefit-session-id": идентификаторСессии,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(
          payload?.message ||
            "Не удалось получить рекомендацию. Попробуйте ещё раз чуть позже.",
        );
      }

      const recommendation = await response.json();
      window.sessionStorage.setItem(
        RESULT_STORAGE_KEY,
        JSON.stringify(recommendation),
      );

      void trackEvent("quiz_step_completed", {
        step_name: stepNames[step],
        step_number: step + 1,
      });
      void trackEvent("quiz_completed", {
        riding_style: payload.ridingStyle,
        terrain_priority: payload.terrainPriority,
        skill_level: payload.skillLevel,
        board_line_preference: payload.boardLinePreference,
        result_width_type: recommendation.recommendedWidthType,
        result_boot_drag_risk: recommendation.bootDragRisk,
      });

      startTransition(() => {
        router.push("/result");
      });
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : "Сервис временно недоступен. Попробуйте ещё раз.",
      );
      setIsSubmitting(false);
    }
  }

  function nextStep() {
    if (isBusy) {
      return;
    }

    const parsed = validateCurrentStep();

    if (!parsed) {
      return;
    }

    void trackEvent("quiz_step_completed", {
      step_name: stepNames[step],
      step_number: step + 1,
    });

    setStep((current) => Math.min(current + 1, stepFields.length - 1));
  }

  function previousStep() {
    if (isBusy) {
      return;
    }

    setStep((current) => Math.max(current - 1, 0));
  }

  return (
    <div className={styles.quizLayout} aria-busy={isBusy}>
      <section
        className={`${publicStyles.raisedTechnicalSurface} ${styles.quizCore}`}
        aria-labelledby="quiz-step-title"
      >
        <div
          className={styles.progress}
          role="progressbar"
          aria-label={`Шаг ${step + 1} из 3: ${currentStep.shortLabel}`}
          aria-valuemin={1}
          aria-valuemax={stepFields.length}
          aria-valuenow={step + 1}
        >
          <ol className={styles.progressSteps} aria-hidden="true">
            {stepDetails.map((item, index) => {
              const state =
                index < step ? "completed" : index === step ? "active" : "upcoming";

              return (
                <li key={item.shortLabel} data-state={state}>
                  <span className={styles.progressMarker}>
                    {state === "completed" ? "✓" : index + 1}
                  </span>
                  <span>{item.shortLabel}</span>
                  <small>{state === "active" ? "сейчас" : state === "completed" ? "готово" : "далее"}</small>
                </li>
              );
            })}
          </ol>
        </div>

        <header className={styles.stepHeader}>
          <p className={publicStyles.microLabel}>
            Шаг {step + 1} / {stepFields.length} · {currentStep.eyebrow}
          </p>
          <h2 id="quiz-step-title" ref={stepHeadingRef} tabIndex={-1}>
            {currentStep.title}
          </h2>
          <p>{currentStep.description}</p>
        </header>

        <div className={styles.stepContent} key={step}>
          {step === 0 ? (
            <div className={styles.measurementGrid}>
              <NumberField
                id="heightCm"
                label="Рост"
                unit="см"
                hint="Например, 178"
                explanation="Помогает скорректировать рабочий диапазон длины."
                value={draft.heightCm}
                onChange={(value) => updateDraft("heightCm", value)}
                error={errors.heightCm}
                step="1"
              />
              <NumberField
                id="weightKg"
                label="Вес"
                unit="кг"
                hint="Например, 74"
                explanation="Главный ориентир для базовой ростовки."
                value={draft.weightKg}
                onChange={(value) => updateDraft("weightKg", value)}
                error={errors.weightKg}
                step="1"
              />
              <NumberField
                id="bootSizeEu"
                label="Размер ботинка"
                unit="EU"
                hint="Например, 43 или 43.5"
                explanation="Влияет на ширину доски и риск boot drag."
                value={draft.bootSizeEu}
                onChange={(value) => updateDraft("bootSizeEu", value)}
                error={errors.bootSizeEu}
                step="0.5"
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div className={styles.questionStack}>
              <ChoiceGroup
                name="boardLinePreference"
                label="Линейка досок"
                helper="Это фильтр каталога, а не отдельная формула размера."
                value={draft.boardLinePreference}
                onChange={(value) => updateDraft("boardLinePreference", value)}
                options={boardLineOptions}
                error={errors.boardLinePreference}
                columns="three"
              />
              <ChoiceGroup
                name="skillLevel"
                label="Как ты оцениваешь свой уровень?"
                helper="Выбери описание, которое ближе к твоему катанию сейчас."
                value={draft.skillLevel}
                onChange={(value) => updateDraft("skillLevel", value)}
                options={skillOptions}
                error={errors.skillLevel}
                columns="three"
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className={styles.questionStack}>
              <ChoiceGroup
                name="ridingStyle"
                label="Базовый стиль"
                helper="Выбери ближайшее направление. Ниже отдельно уточним главный приоритет."
                value={draft.ridingStyle}
                onChange={(value) => updateDraft("ridingStyle", value)}
                options={ridingStyleOptions}
                error={errors.ridingStyle}
                columns="three"
              />
              <ChoiceGroup
                name="terrainPriority"
                label="Главный приоритет"
                helper="Что ты хочешь получить от доски в первую очередь?"
                value={draft.terrainPriority}
                onChange={(value) => updateDraft("terrainPriority", value)}
                options={terrainPriorityOptions}
                error={errors.terrainPriority}
                columns="two"
              />
              <ChoiceGroup
                name="aggressiveness"
                label="Какой характер доски нравится?"
                helper="Это про ощущение доски, а не про уровень райдера."
                value={draft.aggressiveness}
                onChange={(value) => updateDraft("aggressiveness", value)}
                options={aggressivenessOptions}
                error={errors.aggressiveness}
                columns="three"
              />
              <ChoiceGroup
                name="stanceType"
                label="Какая у тебя стойка?"
                helper="Стойка немного влияет на запас против boot drag. Если не знаешь — это нормально."
                value={draft.stanceType}
                onChange={(value) => updateDraft("stanceType", value)}
                options={stanceOptions}
                error={errors.stanceType}
                columns="three"
              />
            </div>
          ) : null}
        </div>

        {submissionError ? (
          <div className={styles.submissionError} role="alert">
            <strong>Не получилось завершить подбор</strong>
            <p>{submissionError}</p>
          </div>
        ) : null}
      </section>

      <aside className={styles.contextRail} aria-labelledby="quiz-output-title">
        <div className={styles.contextCoordinate} aria-hidden="true">
          EF / FIT 0{step + 1}
        </div>
        <p className={publicStyles.microLabel}>Что получится на выходе</p>
        <h2 id="quiz-output-title">Понятный fit, а не одна случайная цифра</h2>
        <dl className={styles.outputList}>
          {resultOutputs.map(([number, term, description]) => (
            <div key={term}>
              <span aria-hidden="true">{number}</span>
              <div>
                <dt>{term}</dt>
                <dd>{description}</dd>
              </div>
            </div>
          ))}
        </dl>
        <div className={styles.contextNote}>
          <p className={publicStyles.microLabel}>Зачем этот шаг</p>
          <p>{currentStep.context}</p>
        </div>
        <p className={styles.contextDisclaimer}>
          Предварительные цифры не показываем: сначала нужны все ответы, затем
          считаем реальный fit.
        </p>
      </aside>

      <div className={styles.navigation} data-first-step={step === 0}>
        {step > 0 ? (
          <button
            type="button"
            onClick={previousStep}
            disabled={isBusy}
            className={`${publicStyles.secondaryAction} ${styles.navigationAction}`}
          >
            <span aria-hidden="true">←</span>
            Назад
          </button>
        ) : null}

        {step < stepFields.length - 1 ? (
          <button
            type="button"
            onClick={nextStep}
            disabled={isBusy}
            className={`${publicStyles.primaryAction} ${styles.navigationAction}`}
          >
            Продолжить
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isBusy}
            aria-busy={isBusy}
            className={`${publicStyles.primaryAction} ${styles.navigationAction}`}
          >
            {isBusy ? "Подбираем доски…" : "Получить подбор"}
            {!isBusy ? <span aria-hidden="true">→</span> : null}
          </button>
        )}
      </div>
    </div>
  );
}

interface NumberFieldProps {
  id: "heightCm" | "weightKg" | "bootSizeEu";
  label: string;
  unit: string;
  hint: string;
  explanation: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  step: string;
}

function NumberField({
  id,
  label,
  unit,
  hint,
  explanation,
  value,
  onChange,
  error,
  step,
}: NumberFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? `${hintId} ${errorId}` : hintId;

  return (
    <div className={styles.numberField}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.numberControl}>
        <input
          id={id}
          name={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
        <span aria-hidden="true">{unit}</span>
      </div>
      <div id={hintId} className={styles.fieldHint}>
        <span>{hint}</span>
        <p>{explanation}</p>
      </div>
      {error ? (
        <p id={errorId} className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface ChoiceGroupProps<Value extends string> {
  name: keyof QuizSubmission;
  label: string;
  helper: string;
  value: Value;
  onChange: (value: Value) => void;
  options: readonly ChoiceOption<Value>[];
  error?: string;
  columns: "two" | "three";
}

function ChoiceGroup<Value extends string>({
  name,
  label,
  helper,
  value,
  onChange,
  options,
  error,
  columns,
}: ChoiceGroupProps<Value>) {
  const helperId = `${name}-helper`;
  const errorId = `${name}-error`;
  const describedBy = error ? `${helperId} ${errorId}` : helperId;

  return (
    <fieldset
      className={styles.choiceGroup}
      aria-describedby={describedBy}
      aria-invalid={Boolean(error)}
    >
      <legend>{label}</legend>
      <p id={helperId} className={styles.groupHelper}>
        {helper}
      </p>
      <div className={styles.choiceGrid} data-columns={columns}>
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <label
              key={option.value}
              className={styles.choiceCard}
              data-selected={selected}
            >
              <input
                className={styles.choiceInput}
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                aria-describedby={describedBy}
              />
              <span className={styles.choiceMarker} aria-hidden="true" />
              <span className={styles.choiceContent}>
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </span>
              {selected ? (
                <span className={styles.selectedLabel}>Выбрано</span>
              ) : null}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className={styles.groupError} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
