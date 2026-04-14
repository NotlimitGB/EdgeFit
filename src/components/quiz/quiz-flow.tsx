"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics/client";
import { boardLineLabels, terrainPriorityLabels } from "@/lib/content";
import {
  defaultQuizDraft,
  quizSubmissionSchema,
  type QuizSubmission,
} from "@/lib/quiz/schema";
import { getOrCreateSessionId } from "@/lib/session-id";

const STORAGE_KEY = "edgefit.quiz-draft";
const RESULT_STORAGE_KEY = "edgefit.latest-recommendation";

const stepFields = [
  ["heightCm", "weightKg", "bootSizeEu"],
  ["boardLinePreference", "skillLevel"],
  ["ridingStyle", "terrainPriority", "aggressiveness", "stanceType"],
] as const;
const stepNames = ["body", "profile", "style"] as const;

type DraftState = Record<keyof QuizSubmission, string>;

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
  const [errors, setErrors] = useState<Partial<Record<keyof QuizSubmission, string>>>(
    {},
  );
  const [submissionError, setSubmissionError] = useState("");
  const [isPending, startTransition] = useTransition();

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

  const progress = ((step + 1) / stepFields.length) * 100;

  function updateDraft<Key extends keyof DraftState>(key: Key, value: DraftState[Key]) {
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
    const scopedErrors = fields.reduce<Partial<Record<keyof QuizSubmission, string>>>(
      (accumulator, field) => {
        const message = nextErrors[field]?.[0];
        if (message) {
          accumulator[field] = message;
        }
        return accumulator;
      },
      {},
    );

    setErrors((current) => ({ ...current, ...scopedErrors }));
    return null;
  }

  async function handleSubmit() {
    const payload = validateCurrentStep();

    if (!payload) {
      return;
    }

    setSubmissionError("");

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
    }
  }

  function nextStep() {
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
    setStep((current) => Math.max(current - 1, 0));
  }

  return (
    <div className="grid gap-10 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="panel p-6 sm:p-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <span className="eyebrow">Шаг {step + 1} из 3</span>
            <h1 className="heading-display mt-4 text-4xl font-bold sm:text-5xl">
              Короткий квиз без лишних вопросов
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-8 text-[var(--color-muted)] sm:text-lg">
              Нужны только те данные, которые действительно влияют на длину,
              ширину и риск зацепа ботинком. Без длинной анкеты и странных
              вопросов ради галочки.
            </p>
          </div>
        </div>

        <div className="mb-8 h-2 overflow-hidden rounded-full bg-[var(--color-ice)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-sky-deep),var(--color-sky))]"
            style={{ width: `${progress}%` }}
          />
        </div>

        {step === 0 ? (
          <div className="grid gap-5 md:grid-cols-3">
            <NumberField
              label="Рост, см"
              hint="Например, 178"
              value={draft.heightCm}
              onChange={(value) => updateDraft("heightCm", value)}
              error={errors.heightCm}
            />
            <NumberField
              label="Вес, кг"
              hint="Например, 74"
              value={draft.weightKg}
              onChange={(value) => updateDraft("weightKg", value)}
              error={errors.weightKg}
            />
            <NumberField
              label="Размер ботинка, EU"
              hint="Например, 43 или 44.5"
              value={draft.bootSizeEu}
              onChange={(value) => updateDraft("bootSizeEu", value)}
              error={errors.bootSizeEu}
            />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-6">
            <ChoiceGroup
              label="Линейка досок"
              value={draft.boardLinePreference}
              onChange={(value) => updateDraft("boardLinePreference", value)}
              options={[
                {
                  value: "men",
                  title: boardLineLabels.men,
                  description: "Обычно здесь больше универсальных и широких моделей.",
                },
                {
                  value: "women",
                  title: boardLineLabels.women,
                  description: "Ближе к женским моделям и более узким талиям доски.",
                },
                {
                  value: "any",
                  title: boardLineLabels.any,
                  description: "Будем смотреть только на ваши реальные параметры, без жёсткой привязки к линейке.",
                },
              ]}
              error={errors.boardLinePreference}
            />
            <ChoiceGroup
              label="Ваш уровень"
              value={draft.skillLevel}
              onChange={(value) => updateDraft("skillLevel", value)}
              options={[
                {
                  value: "beginner",
                  title: "Начинающий",
                  description: "Лучше смотреть на более понятные и прощающие модели.",
                },
                {
                  value: "intermediate",
                  title: "Средний уровень",
                  description: "Нужен хороший баланс контроля, прогресса и стабильности.",
                },
                {
                  value: "advanced",
                  title: "Продвинутый",
                  description: "Можно смотреть на более жёсткие и требовательные модели.",
                },
              ]}
              error={errors.skillLevel}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-6">
            <ChoiceGroup
              label="Основной стиль катания"
              value={draft.ridingStyle}
              onChange={(value) => updateDraft("ridingStyle", value)}
              options={[
                {
                  value: "all-mountain",
                  title: "All-mountain",
                  description: "Нужна универсальная доска без сильного перекоса в одну сторону.",
                },
                {
                  value: "park",
                  title: "Park / freestyle",
                  description: "Часто лучше что-то покороче, живее и легче в перекантовке.",
                },
                {
                  value: "freeride",
                  title: "Freeride / powder",
                  description: "Часто лучше чуть длиннее, спокойнее и стабильнее.",
                },
              ]}
              error={errors.ridingStyle}
            />
            <ChoiceGroup
              label="Что для вас важнее всего"
              value={draft.terrainPriority}
              onChange={(value) => updateDraft("terrainPriority", value)}
              options={[
                {
                  value: "balanced",
                  title: terrainPriorityLabels.balanced,
                  description: "Хочется одну доску на разные сценарии без явного перекоса.",
                },
                {
                  value: "switch-freestyle",
                  title: terrainPriorityLabels["switch-freestyle"],
                  description: "Хочется легче катать свич, крутиться и сохранить более живое ощущение доски.",
                },
                {
                  value: "groomers-carving",
                  title: terrainPriorityLabels["groomers-carving"],
                  description: "Важнее уверенность на трассе, хорошая дуга и спокойствие на скорости.",
                },
                {
                  value: "soft-snow",
                  title: terrainPriorityLabels["soft-snow"],
                  description: "Хочется больше запаса в мягком снегу, каше и разбитом рельефе.",
                },
              ]}
              error={errors.terrainPriority}
            />
            <ChoiceGroup
              label="Предпочтение по характеру доски"
              value={draft.aggressiveness}
              onChange={(value) => updateDraft("aggressiveness", value)}
              options={[
                {
                  value: "relaxed",
                  title: "Спокойный",
                  description: "Важнее комфорт, контроль и прощение ошибок.",
                },
                {
                  value: "balanced",
                  title: "Сбалансированный",
                  description: "Нужен баланс между стабильностью и манёвренностью.",
                },
                {
                  value: "aggressive",
                  title: "Агрессивный",
                  description: "Нужен больший запас по стабильности, скорости и поддержке.",
                },
              ]}
              error={errors.aggressiveness}
            />
            <ChoiceGroup
              label="Стойка / углы"
              value={draft.stanceType}
              onChange={(value) => updateDraft("stanceType", value)}
              options={[
                {
                  value: "standard",
                  title: "Стандартная",
                  description: "Обычная стойка без сильного разворота носков наружу.",
                },
                {
                  value: "duck",
                  title: "Duck stance",
                  description: "Часто даёт немного больше запаса против зацепа ботинком.",
                },
                {
                  value: "unknown",
                  title: "Не знаю",
                  description: "Тогда просто дадим более осторожную оценку риска.",
                },
              ]}
              error={errors.stanceType}
            />
          </div>
        ) : null}

        {submissionError ? (
          <p className="mt-6 rounded-2xl border border-[rgba(173,62,55,0.18)] bg-[rgba(173,62,55,0.08)] px-4 py-3 text-sm font-medium text-[var(--color-danger)]">
            {submissionError}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={previousStep}
            disabled={step === 0 || isPending}
            className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-bold text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Назад
          </button>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/catalog"
              className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
            >
              Открыть каталог
            </Link>
            {step < stepFields.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-5 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
              >
                Дальше
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-5 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)] disabled:cursor-wait disabled:opacity-75"
              >
                {isPending ? "Считаем подбор..." : "Получить рекомендации"}
              </button>
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <div className="panel p-6">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
            Что учитываем
          </p>
          <ul className="mt-5 space-y-4 text-sm leading-7 text-[var(--color-muted)]">
            <li>Вес сильнее влияет на длину доски, чем рост.</li>
            <li>Стиль катания смещает рекомендацию: для park чаще короче, для freeride чаще длиннее.</li>
            <li>Приоритет помогает точнее понять, какая форма доски вам ближе.</li>
            <li>Размер ботинка и стойка влияют на ширину и риск зацепа.</li>
            <li>Подходящие модели подбираются по размерной сетке, уровню и характеру доски.</li>
          </ul>
        </div>

        <div className="panel p-6">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
            Почему квиз короткий
          </p>
          <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
            Мы не собираем всё подряд. Если параметр не влияет на длину, ширину
            или риск зацепа ботинком, значит он не должен мешать подбору.
          </p>
        </div>
      </aside>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function NumberField({ label, hint, value, onChange, error }: NumberFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-[1.2rem] border bg-white px-4 py-4 outline-none ${
          error
            ? "border-[rgba(173,62,55,0.36)]"
            : "border-[var(--color-border)] focus:border-[var(--color-sky)]"
        }`}
      />
      <span className="mt-2 block text-sm text-[var(--color-muted)]">
        {error ?? hint}
      </span>
    </label>
  );
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; title: string; description: string }[];
  error?: string;
}

function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
}: ChoiceGroupProps<T>) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">{label}</legend>
      <div className="grid gap-3 md:grid-cols-3">
        {options.map((option) => {
          const active = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-[1.2rem] border p-4 text-left ${
                active
                  ? "border-transparent bg-[linear-gradient(145deg,rgba(32,89,119,1),rgba(74,136,170,0.86))] text-white shadow-[0_16px_30px_rgba(32,89,119,0.16)]"
                  : "border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:border-[var(--color-sky)]"
              }`}
            >
              <p className="font-semibold">{option.title}</p>
              <p
                className={`mt-2 text-sm leading-6 ${
                  active ? "text-white/78" : "text-[var(--color-muted)]"
                }`}
              >
                {option.description}
              </p>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-2 text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
