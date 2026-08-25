import { describe, expect, it } from "vitest";
import {
  buildQuizStepAnalyticsPayload,
  buildQuizStepCompletionPayload,
  getQuizStepAfterNavigation,
  QUIZ_STEPS,
  QUIZ_VERSION,
} from "@/lib/analytics/quiz-progression";

describe("quiz progression analytics", () => {
  it("uses stable one-based identities for every rendered step", () => {
    expect(QUIZ_STEPS.map((_, index) => buildQuizStepCompletionPayload(index))).toEqual([
      {
        step_name: "physical_fit",
        step_number: 1,
        quiz_version: QUIZ_VERSION,
        step_index: 1,
        step_key: "physical_fit",
        total_steps: 3,
      },
      expect.objectContaining({
        step_index: 2,
        step_key: "riding_context",
        total_steps: 3,
      }),
      expect.objectContaining({
        step_index: 3,
        step_key: "decision_preferences",
        total_steps: 3,
      }),
    ]);
    expect(buildQuizStepAnalyticsPayload(0).quiz_version).toBe("v2");
  });

  it("emits completion only for a successful forward transition", () => {
    expect(getQuizStepAfterNavigation(1, "back")).toEqual({
      nextStep: 0,
      completionPayload: null,
    });
    expect(getQuizStepAfterNavigation(1, "forward")).toEqual({
      nextStep: 2,
      completionPayload: expect.objectContaining({
        step_index: 2,
        step_key: "riding_context",
      }),
    });
  });

  it("rejects a non-rendered step", () => {
    expect(() => buildQuizStepCompletionPayload(3)).toThrowError("quiz_step_out_of_range");
  });
});
