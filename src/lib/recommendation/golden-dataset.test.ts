import { describe, expect, it } from "vitest";
import type { QuizInput } from "@/types/domain";
import { quizSubmissionSchema } from "@/lib/quiz/schema";
import {
  goldenRecommendationCases,
  goldenRecommendationInvariants,
} from "./golden-dataset";

const widthRank = { regular: 0, "mid-wide": 1, wide: 2 } as const;
const dragRank = { low: 0, medium: 1, high: 2 } as const;
const supportRank = { forgiving: 0, balanced: 1, supportive: 2 } as const;

function omitInputDimension(
  input: Readonly<QuizInput>,
  dimension: keyof QuizInput,
) {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== dimension),
  );
}

function physicalFitExpectation(
  expectation: (typeof goldenRecommendationCases)[number]["expectation"],
) {
  return {
    length: expectation.length,
    widthTypesAllowed: expectation.widthTypesAllowed,
    targetWaistWidthMm: expectation.targetWaistWidthMm,
    bootDragRisksAllowed: expectation.bootDragRisksAllowed,
    primaryShapesAllowed: expectation.primaryShapesAllowed,
    supportProfilesAllowed: expectation.supportProfilesAllowed,
  };
}

describe("golden recommendation dataset", () => {
  it("contains exactly 36 curated cases in the planned category split", () => {
    expect(goldenRecommendationCases).toHaveLength(36);

    const categoryCounts = Object.groupBy(
      goldenRecommendationCases,
      (goldenCase) => goldenCase.category,
    );

    expect(categoryCounts["weight-height"]).toHaveLength(8);
    expect(categoryCounts["boot-stance"]).toHaveLength(12);
    expect(categoryCounts["riding-intent"]).toHaveLength(10);
    expect(categoryCounts["board-line"]).toHaveLength(3);
    expect(categoryCounts.skill).toHaveLength(3);
  });

  it("contains exactly 12 pairwise invariants", () => {
    expect(goldenRecommendationInvariants).toHaveLength(12);
  });

  it("uses deterministic IDs that are unique across both collections", () => {
    const caseIds = goldenRecommendationCases.map(({ id }) => id);
    const invariantIds = goldenRecommendationInvariants.map(({ id }) => id);
    const allIds = [...caseIds, ...invariantIds];

    expect(new Set(caseIds).size).toBe(caseIds.length);
    expect(new Set(invariantIds).size).toBe(invariantIds.length);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.every((id) => /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id))).toBe(
      true,
    );
  });

  it("keeps every input valid under the current quiz schema", () => {
    for (const goldenCase of goldenRecommendationCases) {
      expect(
        quizSubmissionSchema.safeParse(goldenCase.input),
        goldenCase.id,
      ).toMatchObject({ success: true });
    }
  });

  it("keeps ranges, allowed sets and rationale internally valid", () => {
    for (const goldenCase of goldenRecommendationCases) {
      const { expectation } = goldenCase;

      expect(expectation.length.saneMinCm, goldenCase.id).toBeLessThanOrEqual(
        expectation.length.saneMaxCm,
      );
      expect(expectation.length.saneMinCm, goldenCase.id).toBeGreaterThanOrEqual(
        130,
      );
      expect(expectation.length.saneMaxCm, goldenCase.id).toBeLessThanOrEqual(
        180,
      );
      expect(
        expectation.targetWaistWidthMm.min,
        goldenCase.id,
      ).toBeLessThanOrEqual(expectation.targetWaistWidthMm.max);
      expect(
        expectation.targetWaistWidthMm.min,
        goldenCase.id,
      ).toBeGreaterThanOrEqual(220);
      expect(
        expectation.targetWaistWidthMm.max,
        goldenCase.id,
      ).toBeLessThanOrEqual(300);

      expect(expectation.widthTypesAllowed.length, goldenCase.id).toBeGreaterThan(
        0,
      );
      expect(
        expectation.bootDragRisksAllowed.length,
        goldenCase.id,
      ).toBeGreaterThan(0);
      expect(
        expectation.primaryShapesAllowed.length,
        goldenCase.id,
      ).toBeGreaterThan(0);
      expect(
        expectation.supportProfilesAllowed.length,
        goldenCase.id,
      ).toBeGreaterThan(0);
      expect(expectation.rationale.length, goldenCase.id).toBeGreaterThan(0);
      expect(
        expectation.rationale.every((reason) => reason.trim().length > 0),
        goldenCase.id,
      ).toBe(true);
      expect(goldenCase.tags.length, goldenCase.id).toBeGreaterThan(0);
      expect(goldenCase.title.trim().length, goldenCase.id).toBeGreaterThan(0);
    }
  });

  it("uses only current domain values in every allowed expectation set", () => {
    const widths = new Set(["regular", "mid-wide", "wide"]);
    const dragRisks = new Set(["low", "medium", "high"]);
    const shapes = new Set([
      "twin",
      "asym-twin",
      "directional-twin",
      "directional",
      "tapered-directional",
    ]);
    const supportProfiles = new Set(["forgiving", "balanced", "supportive"]);

    for (const goldenCase of goldenRecommendationCases) {
      expect(
        goldenCase.expectation.widthTypesAllowed.every((value) =>
          widths.has(value),
        ),
        goldenCase.id,
      ).toBe(true);
      expect(
        goldenCase.expectation.bootDragRisksAllowed.every((value) =>
          dragRisks.has(value),
        ),
        goldenCase.id,
      ).toBe(true);
      expect(
        goldenCase.expectation.primaryShapesAllowed.every((value) =>
          shapes.has(value),
        ),
        goldenCase.id,
      ).toBe(true);
      expect(
        goldenCase.expectation.supportProfilesAllowed.every((value) =>
          supportProfiles.has(value),
        ),
        goldenCase.id,
      ).toBe(true);
    }
  });

  it("covers every quiz enum dimension", () => {
    const valuesFor = <Key extends keyof QuizInput>(key: Key) =>
      new Set(goldenRecommendationCases.map(({ input }) => input[key]));

    expect(valuesFor("skillLevel")).toEqual(
      new Set(["beginner", "intermediate", "advanced"]),
    );
    expect(valuesFor("ridingStyle")).toEqual(
      new Set(["all-mountain", "park", "freeride"]),
    );
    expect(valuesFor("terrainPriority")).toEqual(
      new Set([
        "balanced",
        "switch-freestyle",
        "groomers-carving",
        "soft-snow",
      ]),
    );
    expect(valuesFor("aggressiveness")).toEqual(
      new Set(["relaxed", "balanced", "aggressive"]),
    );
    expect(valuesFor("stanceType")).toEqual(
      new Set(["standard", "duck", "unknown"]),
    );
    expect(valuesFor("boardLinePreference")).toEqual(
      new Set(["men", "women", "any"]),
    );
  });

  it("covers all required weight bands with representative cases", () => {
    const weights = goldenRecommendationCases.map(({ input }) => input.weightKg);
    const requiredBands = [
      [35, 45],
      [45, 55],
      [55, 65],
      [65, 75],
      [75, 85],
      [85, 95],
      [95, 110],
      [110, 150],
    ] as const;

    for (const [min, max] of requiredBands) {
      expect(
        weights.some((weight) => weight >= min && weight <= max),
        `${min}-${max} kg`,
      ).toBe(true);
    }
  });

  it("covers required boot sizes and boundary half-sizes", () => {
    const bootSizes = new Set(
      goldenRecommendationCases.map(({ input }) => input.bootSizeEu),
    );

    for (const requiredSize of [37, 41, 43, 43.5, 44, 44.5, 45, 45.5, 46, 49]) {
      expect(bootSizes.has(requiredSize), `EU ${requiredSize}`).toBe(true);
    }
  });

  it("includes explicit short-heavy and tall-light conflict cases", () => {
    const shortHeavy = goldenRecommendationCases.find(
      ({ tags }) => tags.includes("short-heavy"),
    );
    const tallLight = goldenRecommendationCases.find(({ tags }) =>
      tags.includes("tall-light"),
    );

    expect(shortHeavy?.input.heightCm).toBeLessThanOrEqual(165);
    expect(shortHeavy?.input.weightKg).toBeGreaterThanOrEqual(85);
    expect(tallLight?.input.heightCm).toBeGreaterThanOrEqual(185);
    expect(tallLight?.input.weightKg).toBeLessThanOrEqual(60);
  });

  it("never makes a tagged large boot regular-only", () => {
    const largeBootCases = goldenRecommendationCases.filter(({ tags }) =>
      tags.includes("large-boot"),
    );

    expect(largeBootCases.length).toBeGreaterThan(0);
    for (const goldenCase of largeBootCases) {
      expect(goldenCase.expectation.widthTypesAllowed, goldenCase.id).not.toEqual([
        "regular",
      ]);
    }
  });

  it("requires wide as the only category for every very-large-boot case", () => {
    const veryLargeBootCases = goldenRecommendationCases.filter(({ tags }) =>
      tags.includes("very-large-boot"),
    );

    expect(veryLargeBootCases.length).toBeGreaterThan(0);
    for (const goldenCase of veryLargeBootCases) {
      expect(goldenCase.input.bootSizeEu, goldenCase.id).toBeGreaterThanOrEqual(48);
      expect(goldenCase.expectation.widthTypesAllowed, goldenCase.id).toEqual([
        "wide",
      ]);
    }
  });

  it("resolves every invariant and changes only its declared input dimension", () => {
    const casesById = new Map(
      goldenRecommendationCases.map((goldenCase) => [goldenCase.id, goldenCase]),
    );

    for (const invariant of goldenRecommendationInvariants) {
      const left = casesById.get(invariant.leftCaseId);
      const right = casesById.get(invariant.rightCaseId);

      expect(left, `${invariant.id}: left case`).toBeDefined();
      expect(right, `${invariant.id}: right case`).toBeDefined();
      expect(
        left?.input[invariant.varyingInput],
        invariant.id,
      ).not.toEqual(right?.input[invariant.varyingInput]);
      expect(
        omitInputDimension(left!.input, invariant.varyingInput),
        invariant.id,
      ).toEqual(omitInputDimension(right!.input, invariant.varyingInput));
      expect(invariant.rationale.trim().length, invariant.id).toBeGreaterThan(0);
    }
  });

  it("keeps the declared pairwise expectations directionally coherent", () => {
    const casesById = new Map(
      goldenRecommendationCases.map((goldenCase) => [goldenCase.id, goldenCase]),
    );

    for (const invariant of goldenRecommendationInvariants) {
      const left = casesById.get(invariant.leftCaseId)!;
      const right = casesById.get(invariant.rightCaseId)!;

      switch (invariant.rule) {
        case "length_not_shorter":
          expect(right.expectation.length.saneMinCm, invariant.id).toBeGreaterThanOrEqual(
            left.expectation.length.saneMinCm,
          );
          expect(right.expectation.length.saneMaxCm, invariant.id).toBeGreaterThanOrEqual(
            left.expectation.length.saneMaxCm,
          );
          break;
        case "length_not_longer":
          expect(right.expectation.length.saneMinCm, invariant.id).toBeLessThanOrEqual(
            left.expectation.length.saneMinCm,
          );
          expect(right.expectation.length.saneMaxCm, invariant.id).toBeLessThanOrEqual(
            left.expectation.length.saneMaxCm,
          );
          break;
        case "waist_not_narrower":
          expect(
            right.expectation.targetWaistWidthMm.min,
            invariant.id,
          ).toBeGreaterThanOrEqual(left.expectation.targetWaistWidthMm.min);
          expect(
            right.expectation.targetWaistWidthMm.max,
            invariant.id,
          ).toBeGreaterThanOrEqual(left.expectation.targetWaistWidthMm.max);
          break;
        case "width_not_narrower":
          expect(
            Math.min(...right.expectation.widthTypesAllowed.map((value) => widthRank[value])),
            invariant.id,
          ).toBeGreaterThanOrEqual(
            Math.min(...left.expectation.widthTypesAllowed.map((value) => widthRank[value])),
          );
          break;
        case "boot_drag_not_lower":
          expect(
            Math.min(...right.expectation.bootDragRisksAllowed.map((value) => dragRank[value])),
            invariant.id,
          ).toBeGreaterThanOrEqual(
            Math.min(...left.expectation.bootDragRisksAllowed.map((value) => dragRank[value])),
          );
          break;
        case "support_not_less_stable":
          expect(
            Math.min(...right.expectation.supportProfilesAllowed.map((value) => supportRank[value])),
            invariant.id,
          ).toBeGreaterThanOrEqual(
            Math.min(...left.expectation.supportProfilesAllowed.map((value) => supportRank[value])),
          );
          break;
        case "same_physical_fit_expectation":
          expect(
            physicalFitExpectation(right.expectation),
            invariant.id,
          ).toEqual(physicalFitExpectation(left.expectation));
          break;
      }
    }
  });
});
