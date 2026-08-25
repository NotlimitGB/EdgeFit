import { z } from "zod";
import type { QuizStepKey } from "@/lib/analytics/quiz-progression";
import { quizSubmissionSchema } from "@/lib/quiz/schema";

export const QUIZ_V2_DRAFT_STORAGE_KEY = "edgefit.quiz-draft.v2";
export const QUIZ_V2_DRAFT_VERSION = "v2" as const;

const numericDraftValueSchema = z
  .string()
  .refine(
    (value) => value === "" || /^-?\d+(?:\.\d+)?$/u.test(value),
    "invalid_quiz_numeric_draft",
  );

const quizV2DraftSchema = z.strictObject({
  heightCm: numericDraftValueSchema,
  weightKg: numericDraftValueSchema,
  bootSizeEu: numericDraftValueSchema,
  stanceType: z.enum(["standard", "duck", "unknown"]).nullable(),
  skillLevel: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  ridingStyle: z.enum(["all-mountain", "park", "freeride"]).nullable(),
  terrainPriority: z
    .enum(["balanced", "switch-freestyle", "groomers-carving", "soft-snow"])
    .nullable(),
  aggressiveness: z.enum(["relaxed", "balanced", "aggressive"]).nullable(),
  boardLinePreference: z.enum(["men", "women", "any"]),
});

const quizV2DraftEnvelopeSchema = z.strictObject({
  version: z.literal(QUIZ_V2_DRAFT_VERSION),
  values: quizV2DraftSchema,
});

export type QuizV2Draft = z.infer<typeof quizV2DraftSchema>;
export type QuizV2DraftField = keyof QuizV2Draft;
export type QuizV2DraftErrors = Partial<Record<QuizV2DraftField, string>>;

interface QuizDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const QUIZ_V2_STEP_FIELDS = {
  physical_fit: ["heightCm", "weightKg", "bootSizeEu", "stanceType"],
  riding_context: ["skillLevel", "ridingStyle", "terrainPriority"],
  decision_preferences: ["aggressiveness", "boardLinePreference"],
} as const satisfies Record<QuizStepKey, readonly QuizV2DraftField[]>;

const quizV2StepSchemas = {
  physical_fit: quizSubmissionSchema.pick({
    heightCm: true,
    weightKg: true,
    bootSizeEu: true,
    stanceType: true,
  }),
  riding_context: quizSubmissionSchema.pick({
    skillLevel: true,
    ridingStyle: true,
    terrainPriority: true,
  }),
  decision_preferences: quizSubmissionSchema.pick({
    aggressiveness: true,
    boardLinePreference: true,
  }),
} as const satisfies Record<QuizStepKey, z.ZodType>;

const requiredFieldMessages = {
  heightCm: "Укажите рост.",
  weightKg: "Укажите вес.",
  bootSizeEu: "Укажите размер ботинка.",
  stanceType: "Выберите стойку или вариант «Не знаю».",
  skillLevel: "Выберите уровень катания.",
  ridingStyle: "Выберите основной стиль катания.",
  terrainPriority: "Выберите главный приоритет катания.",
  aggressiveness: "Выберите характер катания.",
  boardLinePreference: "Выберите предпочтение по линейке.",
} as const satisfies Record<QuizV2DraftField, string>;

export function createQuizV2Draft(): QuizV2Draft {
  return {
    heightCm: "",
    weightKg: "",
    bootSizeEu: "",
    stanceType: null,
    skillLevel: null,
    ridingStyle: null,
    terrainPriority: null,
    aggressiveness: null,
    boardLinePreference: "any",
  };
}

export function loadQuizV2Draft(storage: QuizDraftStorage): QuizV2Draft {
  try {
    const rawDraft = storage.getItem(QUIZ_V2_DRAFT_STORAGE_KEY);
    if (!rawDraft) {
      return createQuizV2Draft();
    }

    const parsedEnvelope = quizV2DraftEnvelopeSchema.safeParse(
      JSON.parse(rawDraft),
    );
    if (parsedEnvelope.success) {
      return parsedEnvelope.data.values;
    }

    storage.removeItem(QUIZ_V2_DRAFT_STORAGE_KEY);
  } catch {
    try {
      storage.removeItem(QUIZ_V2_DRAFT_STORAGE_KEY);
    } catch {
      // Browser storage may be unavailable; the quiz remains usable in memory.
    }
  }

  return createQuizV2Draft();
}

export function saveQuizV2Draft(
  storage: QuizDraftStorage,
  draft: QuizV2Draft,
) {
  try {
    storage.setItem(
      QUIZ_V2_DRAFT_STORAGE_KEY,
      JSON.stringify({ version: QUIZ_V2_DRAFT_VERSION, values: draft }),
    );
    return true;
  } catch {
    return false;
  }
}

function normalizeQuizV2Draft(draft: QuizV2Draft) {
  return Object.fromEntries(
    Object.entries(draft).map(([field, value]) => [
      field,
      value === "" || value === null ? undefined : value,
    ]),
  ) as Record<QuizV2DraftField, unknown>;
}

function getMissingFieldErrors(
  draft: QuizV2Draft,
  fields: readonly QuizV2DraftField[],
) {
  return fields.reduce<QuizV2DraftErrors>((errors, field) => {
    if (draft[field] === "" || draft[field] === null) {
      errors[field] = requiredFieldMessages[field];
    }
    return errors;
  }, {});
}

export function validateQuizV2Step(
  draft: QuizV2Draft,
  stepKey: QuizStepKey,
): { success: true } | { success: false; errors: QuizV2DraftErrors } {
  const fields = QUIZ_V2_STEP_FIELDS[stepKey];
  const missingErrors = getMissingFieldErrors(draft, fields);
  if (Object.keys(missingErrors).length > 0) {
    return { success: false, errors: missingErrors };
  }

  const result = quizV2StepSchemas[stepKey].safeParse(
    normalizeQuizV2Draft(draft),
  );
  if (result.success) {
    return { success: true };
  }

  const fieldErrors = result.error.flatten().fieldErrors as Partial<
    Record<QuizV2DraftField, string[]>
  >;
  const errors = fields.reduce<QuizV2DraftErrors>((current, field) => {
    const message = fieldErrors[field]?.[0];
    if (message) {
      current[field] = message;
    }
    return current;
  }, {});

  return { success: false, errors };
}

export function parseQuizV2Submission(draft: QuizV2Draft) {
  return quizSubmissionSchema.safeParse(normalizeQuizV2Draft(draft));
}
