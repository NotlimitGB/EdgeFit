export const QUIZ_VERSION = "v2" as const;

export const QUIZ_STEPS = [
  "physical_fit",
  "riding_context",
  "decision_preferences",
] as const;

export type QuizStepKey = (typeof QUIZ_STEPS)[number];

export interface QuizStepCompletionPayload extends Record<string, unknown> {
  step_name: QuizStepKey;
  step_number: number;
  quiz_version: typeof QUIZ_VERSION;
  step_index: number;
  step_key: QuizStepKey;
  total_steps: number;
}

export function buildQuizStepAnalyticsPayload(
  zeroBasedStepIndex: number,
): QuizStepCompletionPayload {
  const stepKey = QUIZ_STEPS[zeroBasedStepIndex];
  if (!stepKey) {
    throw new Error("quiz_step_out_of_range");
  }

  return {
    step_name: stepKey,
    step_number: zeroBasedStepIndex + 1,
    quiz_version: QUIZ_VERSION,
    step_index: zeroBasedStepIndex + 1,
    step_key: stepKey,
    total_steps: QUIZ_STEPS.length,
  };
}

export function buildQuizStepCompletionPayload(zeroBasedStepIndex: number) {
  return buildQuizStepAnalyticsPayload(zeroBasedStepIndex);
}

export function getQuizStepAfterNavigation(
  currentStep: number,
  direction: "forward" | "back",
) {
  if (direction === "back") {
    return {
      nextStep: Math.max(currentStep - 1, 0),
      completionPayload: null,
    } as const;
  }

  return {
    nextStep: Math.min(currentStep + 1, QUIZ_STEPS.length - 1),
    completionPayload: buildQuizStepAnalyticsPayload(currentStep),
  } as const;
}
