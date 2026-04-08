import { getRecommendation } from "@/lib/recommendation/engine";
import type { QuizInput } from "@/types/domain";

export const demoInput: QuizInput = {
  heightCm: 178,
  weightKg: 74,
  bootSizeEu: 44,
  boardLinePreference: "men",
  skillLevel: "intermediate",
  ridingStyle: "all-mountain",
  terrainPriority: "balanced",
  aggressiveness: "balanced",
  stanceType: "standard",
};

export const demoRecommendation = getRecommendation(demoInput);
