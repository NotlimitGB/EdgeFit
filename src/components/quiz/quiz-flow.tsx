"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import publicStyles from "@/components/public/public-ui.module.css";
import { trackEvent } from "@/lib/analytics/client";
import type { QuizSubmission } from "@/lib/quiz/schema";
import {
  createQuizV2Draft,
  loadQuizV2Draft,
  parseQuizV2PurchasePreferences,
  parseQuizV2Submission,
  saveQuizV2Draft,
  validateQuizV2Step,
  type QuizV2Draft,
  type QuizV2DraftErrors,
} from "@/lib/quiz/draft";
import { getOrCreateSessionId } from "@/lib/session-id";
import {
  persistRecommendationSessionState,
  SAVED_RESULT_TOKEN_HEADER,
} from "@/lib/saved-result-contract";
import type { RecommendationResult } from "@/types/domain";
import type { PurchasePreferences } from "@/lib/purchase-preferences";
import {
  buildQuizStepAnalyticsPayload,
  buildQuizStepCompletionPayload,
  getQuizStepAfterNavigation,
  QUIZ_STEPS,
  QUIZ_VERSION,
  type QuizStepKey,
} from "@/lib/analytics/quiz-progression";
import styles from "./quiz-flow.module.css";
import {
  createQuizQuestionHelpTracker,
  WhyWeAsk,
  type QuizQuestionField,
} from "./why-we-ask";

const stepDetails = [
  {
    key: "physical_fit",
    shortLabel: "Параметры",
    eyebrow: "Твои параметры",
    title: "Начнём с того, что реально влияет на размер",
    description:
      "Рост и вес помогают определить длину, а размер ботинка и стойка — безопасную ширину доски.",
    context: "Эти ответы задают физическую основу подбора.",
  },
  {
    key: "riding_context",
    shortLabel: "Катание",
    eyebrow: "Как ты катаешься",
    title: "Теперь уточним твой опыт и сценарий катания",
    description:
      "Уровень, основной стиль и главный приоритет помогают выбрать подходящий характер доски.",
    context:
      "Здесь уточняем опыт и сценарий, в котором должна работать доска.",
  },
  {
    key: "decision_preferences",
    shortLabel: "Предпочтения",
    eyebrow: "Последние детали",
    title: "Осталось уточнить характер, линейку и бюджет",
    description:
      "Характер катания и линейка уточняют выдачу, а необязательный бюджет добавляет только ценовой ориентир.",
    context:
      "Эти ответы добавляют предпочтения поверх уже рассчитанного физического fit.",
  },
] as const;

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
      "Выше ставим модели из этой линейки. Размер и ширину всё равно считаем по твоим параметрам.",
  },
  {
    value: "women",
    title: "Женская",
    description:
      "Выше ставим модели из женской линейки. Физический fit остаётся персональным.",
  },
  {
    value: "any",
    title: "Без привязки",
    description:
      "Не даём линейке дополнительный приоритет и смотрим прежде всего на fit.",
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

export function buildQuizCompletionAnalyticsPayload(
  payload: QuizSubmission,
  recommendation: Pick<
    RecommendationResult,
    "recommendedWidthType" | "bootDragRisk"
  >,
  purchasePreferences: PurchasePreferences,
) {
  return {
    quiz_version: QUIZ_VERSION,
    riding_style: payload.ridingStyle,
    terrain_priority: payload.terrainPriority,
    skill_level: payload.skillLevel,
    board_line_preference: payload.boardLinePreference,
    budget_set: purchasePreferences.budgetMaxRub != null,
    budget_max_rub: purchasePreferences.budgetMaxRub,
    result_width_type: recommendation.recommendedWidthType,
    result_boot_drag_risk: recommendation.bootDragRisk,
  };
}

interface QuizFlowStepFieldsProps {
  stepKey: QuizStepKey;
  draft: QuizV2Draft;
  errors: QuizV2DraftErrors;
  onChange: <Key extends keyof QuizV2Draft>(
    key: Key,
    value: QuizV2Draft[Key],
  ) => void;
  onHelpOpened: (fieldName: QuizQuestionField) => void;
}

export function QuizFlowStepFields({
  stepKey,
  draft,
  errors,
  onChange,
  onHelpOpened,
}: QuizFlowStepFieldsProps) {
  if (stepKey === "physical_fit") {
    return (
      <div className={styles.questionStack}>
        <div className={styles.measurementGrid}>
          <NumberField
            id="heightCm"
            label="Рост"
            unit="см"
            hint="Например, 178"
            value={draft.heightCm}
            onChange={(value) => onChange("heightCm", value)}
            error={errors.heightCm}
            step="1"
            onHelpOpened={onHelpOpened}
          />
          <NumberField
            id="weightKg"
            label="Вес"
            unit="кг"
            hint="Например, 74"
            value={draft.weightKg}
            onChange={(value) => onChange("weightKg", value)}
            error={errors.weightKg}
            step="1"
            onHelpOpened={onHelpOpened}
          />
          <NumberField
            id="bootSizeEu"
            label="Размер ботинка"
            unit="EU"
            hint="Например, 43 или 43.5"
            value={draft.bootSizeEu}
            onChange={(value) => onChange("bootSizeEu", value)}
            error={errors.bootSizeEu}
            step="0.5"
            onHelpOpened={onHelpOpened}
          />
        </div>
        <ChoiceGroup
          name="stanceType"
          label="Какая у тебя стойка?"
          helper="Если не знаешь — выбирай «Не знаю»."
          value={draft.stanceType}
          onChange={(value) => onChange("stanceType", value)}
          options={stanceOptions}
          error={errors.stanceType}
          columns="three"
          onHelpOpened={onHelpOpened}
        />
      </div>
    );
  }

  if (stepKey === "riding_context") {
    return (
      <div className={styles.questionStack}>
        <ChoiceGroup
          name="skillLevel"
          label="Как ты оцениваешь свой уровень?"
          helper="Выбери описание, которое ближе к твоему катанию сейчас."
          value={draft.skillLevel}
          onChange={(value) => onChange("skillLevel", value)}
          options={skillOptions}
          error={errors.skillLevel}
          columns="three"
          onHelpOpened={onHelpOpened}
        />
        <ChoiceGroup
          name="ridingStyle"
          label="Основной стиль катания"
          helper="Выбери ближайшее направление. Ниже отдельно уточним главный приоритет."
          value={draft.ridingStyle}
          onChange={(value) => onChange("ridingStyle", value)}
          options={ridingStyleOptions}
          error={errors.ridingStyle}
          columns="three"
          onHelpOpened={onHelpOpened}
        />
        <ChoiceGroup
          name="terrainPriority"
          label="Главный приоритет"
          helper="Что ты хочешь получить от доски в первую очередь?"
          value={draft.terrainPriority}
          onChange={(value) => onChange("terrainPriority", value)}
          options={terrainPriorityOptions}
          error={errors.terrainPriority}
          columns="two"
          onHelpOpened={onHelpOpened}
        />
      </div>
    );
  }

  return (
    <div className={styles.questionStack}>
      <ChoiceGroup
        name="aggressiveness"
        label="Какой характер доски нравится?"
        helper="Это про ощущение доски, а не про уровень райдера."
        value={draft.aggressiveness}
        onChange={(value) => onChange("aggressiveness", value)}
        options={aggressivenessOptions}
        error={errors.aggressiveness}
        columns="three"
        onHelpOpened={onHelpOpened}
      />
      <ChoiceGroup
        name="boardLinePreference"
        label="Линейка досок"
        helper="«Без привязки» — нейтральный вариант."
        value={draft.boardLinePreference}
        onChange={(value) => onChange("boardLinePreference", value)}
        options={boardLineOptions}
        error={errors.boardLinePreference}
        columns="three"
        onHelpOpened={onHelpOpened}
      />
      <NumberField
        id="budgetMaxRub"
        label="Максимальный бюджет"
        unit="₽"
        hint="Необязательно — пустое поле означает без лимита"
        value={draft.budgetMaxRub}
        onChange={(value) => onChange("budgetMaxRub", value)}
        error={errors.budgetMaxRub}
        step="1"
        onHelpOpened={onHelpOpened}
      />
    </div>
  );
}

export function QuizFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<QuizV2Draft>(createQuizV2Draft);
  const [errors, setErrors] = useState<QuizV2DraftErrors>({});
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const isInitialStep = useRef(true);
  const questionHelpTrackerRef = useRef<ReturnType<
    typeof createQuizQuestionHelpTracker
  > | null>(null);
  const isBusy = isSubmitting || isPending;
  const currentStep = stepDetails[step];

  if (questionHelpTrackerRef.current == null) {
    questionHelpTrackerRef.current = createQuizQuestionHelpTracker(
      (eventName, payload) => {
        void trackEvent(eventName, payload);
      },
    );
  }

  useEffect(() => {
    setDraft(loadQuizV2Draft(window.sessionStorage));
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    if (draftHydrated) {
      saveQuizV2Draft(window.sessionStorage, draft);
    }
  }, [draft, draftHydrated]);

  useEffect(() => {
    getOrCreateSessionId();
    void trackEvent("quiz_started", { quiz_version: QUIZ_VERSION });
  }, []);

  useEffect(() => {
    void trackEvent("quiz_step_viewed", buildQuizStepAnalyticsPayload(step));
  }, [step]);

  useEffect(() => {
    if (isInitialStep.current) {
      isInitialStep.current = false;
      return;
    }

    stepHeadingRef.current?.focus();
  }, [step]);

  function updateDraft<Key extends keyof QuizV2Draft>(
    key: Key,
    value: QuizV2Draft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateCurrentStep() {
    const stepKey = QUIZ_STEPS[step];
    if (!stepKey) {
      return false;
    }
    const result = validateQuizV2Step(draft, stepKey);
    if (result.success) {
      setErrors({});
      return true;
    }
    setErrors((current) => ({ ...current, ...result.errors }));
    return false;
  }

  async function handleSubmit() {
    if (isBusy) {
      return;
    }

    if (!validateCurrentStep()) {
      return;
    }
    const result = parseQuizV2Submission(draft);
    const purchasePreferencesResult = parseQuizV2PurchasePreferences(draft);
    if (!result.success || !purchasePreferencesResult.success) {
      setSubmissionError("Проверьте ответы на предыдущих шагах.");
      return;
    }
    const payload = result.data;
    const purchasePreferences = purchasePreferencesResult.data;

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
        body: JSON.stringify({ ...payload, purchasePreferences }),
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

      const recommendation = (await response.json()) as RecommendationResult;
      persistRecommendationSessionState(
        window.sessionStorage,
        recommendation,
        response.headers.get(SAVED_RESULT_TOKEN_HEADER),
        purchasePreferences,
      );

      void trackEvent("quiz_step_completed", buildQuizStepCompletionPayload(step));
      void trackEvent(
        "quiz_completed",
        buildQuizCompletionAnalyticsPayload(
          payload,
          recommendation,
          purchasePreferences,
        ),
      );

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

    if (!validateCurrentStep()) {
      return;
    }

    const transition = getQuizStepAfterNavigation(step, "forward");
    if (transition.completionPayload) {
      void trackEvent("quiz_step_completed", transition.completionPayload);
    }
    setStep(transition.nextStep);
  }

  function previousStep() {
    if (isBusy) {
      return;
    }

    setStep(getQuizStepAfterNavigation(step, "back").nextStep);
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
          aria-label={`Шаг ${step + 1} из ${QUIZ_STEPS.length}: ${currentStep.shortLabel}`}
          aria-valuemin={1}
          aria-valuemax={QUIZ_STEPS.length}
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
            Шаг {step + 1} / {QUIZ_STEPS.length} · {currentStep.eyebrow}
          </p>
          <h2 id="quiz-step-title" ref={stepHeadingRef} tabIndex={-1}>
            {currentStep.title}
          </h2>
          <p>{currentStep.description}</p>
        </header>

        <div className={styles.stepContent} key={currentStep.key}>
          <QuizFlowStepFields
            stepKey={currentStep.key}
            draft={draft}
            errors={errors}
            onChange={updateDraft}
            onHelpOpened={(fieldName) =>
              questionHelpTrackerRef.current?.open(fieldName)
            }
          />
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

        {step < QUIZ_STEPS.length - 1 ? (
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
  id: "heightCm" | "weightKg" | "bootSizeEu" | "budgetMaxRub";
  label: string;
  unit: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  step: string;
  onHelpOpened: (fieldName: QuizQuestionField) => void;
}

function NumberField({
  id,
  label,
  unit,
  hint,
  value,
  onChange,
  error,
  step,
  onHelpOpened,
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
      </div>
      <WhyWeAsk
        fieldName={id}
        questionLabel={label}
        onOpen={onHelpOpened}
      />
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
  value: Value | null;
  onChange: (value: Value) => void;
  options: readonly ChoiceOption<Value>[];
  error?: string;
  columns: "two" | "three";
  onHelpOpened: (fieldName: QuizQuestionField) => void;
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
  onHelpOpened,
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
      <WhyWeAsk
        fieldName={name as QuizQuestionField}
        questionLabel={label}
        onOpen={onHelpOpened}
      />
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
