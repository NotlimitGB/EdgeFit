import { z } from "zod";

export const quizSubmissionSchema = z.object({
  heightCm: z.coerce
    .number()
    .min(140, "Рост должен быть не меньше 140 см.")
    .max(210, "Рост должен быть не больше 210 см."),
  weightKg: z.coerce
    .number()
    .min(35, "Вес должен быть не меньше 35 кг.")
    .max(150, "Вес должен быть не больше 150 кг."),
  bootSizeEu: z.coerce
    .number()
    .min(34, "Размер ботинка должен быть не меньше EU 34.")
    .max(52, "Размер ботинка должен быть не больше EU 52."),
  boardLinePreference: z.enum(["men", "women", "any"]),
  skillLevel: z.enum(["beginner", "intermediate", "advanced"]),
  ridingStyle: z.enum(["all-mountain", "park", "freeride"]),
  terrainPriority: z.enum([
    "balanced",
    "switch-freestyle",
    "groomers-carving",
    "soft-snow",
  ]),
  aggressiveness: z.enum(["relaxed", "balanced", "aggressive"]),
  stanceType: z.enum(["standard", "duck", "unknown"]),
});

export const defaultQuizDraft = {
  heightCm: 178,
  weightKg: 74,
  bootSizeEu: 43,
  boardLinePreference: "men",
  skillLevel: "intermediate",
  ridingStyle: "all-mountain",
  terrainPriority: "balanced",
  aggressiveness: "balanced",
  stanceType: "unknown",
} as const;

export type QuizSubmission = z.infer<typeof quizSubmissionSchema>;
