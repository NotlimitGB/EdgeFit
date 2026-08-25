import { describe, expect, it } from "vitest";
import {
  createQuizV2Draft,
  loadQuizV2Draft,
  parseQuizV2Submission,
  QUIZ_V2_DRAFT_STORAGE_KEY,
  QUIZ_V2_STEP_FIELDS,
  saveQuizV2Draft,
  validateQuizV2Step,
  type QuizV2Draft,
} from "@/lib/quiz/draft";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const completedDraft: QuizV2Draft = {
  heightCm: "178",
  weightKg: "74",
  bootSizeEu: "43",
  stanceType: "unknown",
  skillLevel: "intermediate",
  ridingStyle: "all-mountain",
  terrainPriority: "balanced",
  aggressiveness: "balanced",
  boardLinePreference: "any",
};

describe("Quiz v2 draft contract", () => {
  it("starts without an accidental rider persona", () => {
    expect(createQuizV2Draft()).toEqual({
      heightCm: "",
      weightKg: "",
      bootSizeEu: "",
      stanceType: null,
      skillLevel: null,
      ridingStyle: null,
      terrainPriority: null,
      aggressiveness: null,
      boardLinePreference: "any",
    });
    expect(parseQuizV2Submission(createQuizV2Draft()).success).toBe(false);
  });

  it("keeps the accepted three-step field order", () => {
    expect(QUIZ_V2_STEP_FIELDS).toEqual({
      physical_fit: ["heightCm", "weightKg", "bootSizeEu", "stanceType"],
      riding_context: ["skillLevel", "ridingStyle", "terrainPriority"],
      decision_preferences: ["aggressiveness", "boardLinePreference"],
    });
  });

  it("validates only the current step", () => {
    const stepOneDraft = {
      ...createQuizV2Draft(),
      heightCm: "178",
      weightKg: "74",
      bootSizeEu: "43",
      stanceType: "unknown",
    } satisfies QuizV2Draft;

    expect(validateQuizV2Step(createQuizV2Draft(), "physical_fit")).toEqual({
      success: false,
      errors: {
        heightCm: "Укажите рост.",
        weightKg: "Укажите вес.",
        bootSizeEu: "Укажите размер ботинка.",
        stanceType: "Выберите стойку или вариант «Не знаю».",
      },
    });
    expect(validateQuizV2Step(stepOneDraft, "physical_fit")).toEqual({
      success: true,
    });
    expect(validateQuizV2Step(stepOneDraft, "riding_context").success).toBe(
      false,
    );
  });

  it("requires every riding-context answer", () => {
    const draft = {
      ...completedDraft,
      terrainPriority: null,
    } satisfies QuizV2Draft;

    expect(validateQuizV2Step(draft, "riding_context")).toEqual({
      success: false,
      errors: { terrainPriority: "Выберите главный приоритет катания." },
    });
  });

  it("accepts neutral board line but requires aggressiveness", () => {
    const draft = {
      ...completedDraft,
      aggressiveness: null,
    } satisfies QuizV2Draft;

    expect(validateQuizV2Step(draft, "decision_preferences")).toEqual({
      success: false,
      errors: { aggressiveness: "Выберите характер катания." },
    });
    expect(validateQuizV2Step(completedDraft, "decision_preferences")).toEqual({
      success: true,
    });
  });

  it("normalizes an explicit completed draft to the unchanged API payload", () => {
    const result = parseQuizV2Submission(completedDraft);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data).toEqual({
      heightCm: 178,
      weightKg: 74,
      bootSizeEu: 43,
      boardLinePreference: "any",
      skillLevel: "intermediate",
      ridingStyle: "all-mountain",
      terrainPriority: "balanced",
      aggressiveness: "balanced",
      stanceType: "unknown",
    });
    expect(Object.keys(result.data)).toHaveLength(9);
  });

  it("persists and hydrates a legitimate incomplete v2 draft", () => {
    const storage = new MemoryStorage();
    const draft = { ...createQuizV2Draft(), heightCm: "180" };

    expect(saveQuizV2Draft(storage, draft)).toBe(true);
    expect(JSON.parse(storage.getItem(QUIZ_V2_DRAFT_STORAGE_KEY)!)).toEqual({
      version: "v2",
      values: draft,
    });
    expect(loadQuizV2Draft(storage)).toEqual(draft);
  });

  it("never imports the legacy v1 draft key", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "edgefit.quiz-draft",
      JSON.stringify({ heightCm: "178", weightKg: "74", bootSizeEu: "43" }),
    );

    expect(loadQuizV2Draft(storage)).toEqual(createQuizV2Draft());
  });

  it.each([
    "{broken",
    JSON.stringify({ version: "v1", values: completedDraft }),
    JSON.stringify({
      version: "v2",
      values: { ...completedDraft, stanceType: "forward" },
    }),
    JSON.stringify({
      version: "v2",
      values: { ...completedDraft, heightCm: "178cm" },
    }),
    JSON.stringify({
      version: "v2",
      values: { ...completedDraft, heightCm: "1e2" },
    }),
    JSON.stringify({
      version: "v2",
      values: { ...completedDraft, heightCm: "0x64" },
    }),
    JSON.stringify({
      version: "v2",
      values: { ...completedDraft, unexpected: true },
    }),
    JSON.stringify({ version: "v2", values: [] }),
  ])("discards malformed stored state without constructing a persona", (raw) => {
    const storage = new MemoryStorage();
    storage.setItem(QUIZ_V2_DRAFT_STORAGE_KEY, raw);

    expect(loadQuizV2Draft(storage)).toEqual(createQuizV2Draft());
    expect(storage.getItem(QUIZ_V2_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("hydrates structurally valid out-of-range input for canonical validation", () => {
    const storage = new MemoryStorage();
    const draft = { ...completedDraft, heightCm: "999" };
    saveQuizV2Draft(storage, draft);

    expect(loadQuizV2Draft(storage)).toEqual(draft);
    expect(validateQuizV2Step(draft, "physical_fit")).toEqual({
      success: false,
      errors: { heightCm: "Рост должен быть не больше 210 см." },
    });
  });
});
