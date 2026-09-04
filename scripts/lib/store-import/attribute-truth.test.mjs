import { describe, expect, it } from "vitest";
import { classifyWidthType } from "./common.mjs";
import {
  assertProductTruthV2,
  buildProductTruthV2,
  buildSizeTruthV2,
  classifyTruthWidthType,
  knownTruth,
  mergeProductTruthV2,
  resolveBoardLineTruth,
  resolveCamberTruth,
  resolveFlexTruth,
  resolveRidingStylesTruth,
  resolveShapeTruth,
  resolveSkillApplicabilityTruth,
} from "./attribute-truth.mjs";

const context = {
  sourceName: "Merchant",
  sourceUrl: "https://example.com/board",
  observedAt: "2026-08-31T00:00:00.000Z",
  sourceField: "field",
};

describe("attribute truth resolvers", () => {
  it.each([
    ["", null, "unknown"],
    ["nonsense", null, "unknown"],
    ["all-mountain", ["all-mountain"], "known"],
    ["Freestyle", ["park"], "known"],
    ["Freeride", ["freeride"], "known"],
    ["All Mountain / Freestyle", ["all-mountain", "park"], "known"],
    ["Freestyle / Freeride", ["park", "freeride"], "known"],
    ["POW", ["freeride"], "known"],
    ["Парк Джиб", ["park"], "known"],
  ])("resolves riding styles from %j", (source, value, state) => {
    expect(resolveRidingStylesTruth(source, context)).toMatchObject({
      value,
      evidence: { state },
    });
  });

  it.each([
    ["", null],
    ["Начинающий", { min: "beginner", max: "beginner" }],
    ["Продвинутый", { min: "intermediate", max: "intermediate" }],
    ["Эксперт", { min: "advanced", max: "advanced" }],
    ["Продвинутый Эксперт", { min: "intermediate", max: "advanced" }],
  ])("resolves direct skill evidence from %j", (source, value) => {
    expect(resolveSkillApplicabilityTruth(source, context).value).toEqual(value);
  });

  it.each([
    ["Новичок", "beginner"],
    ["Новичок Продвинутый", "intermediate"],
    ["Новичок\nПродвинутый", "intermediate"],
    ["  НОВИЧОК  ", "beginner"],
  ])("preserves novice skill evidence from %j", (source, max) => {
    expect(resolveSkillApplicabilityTruth(source, context)).toMatchObject({
      value: { min: "beginner", max },
      evidence: {
        state: "known", provenance: "merchant", method: "normalized",
        normalizationRule: "skill-range-v1",
      },
    });
  });

  it.each(["", "nonsense", "xновичок", "новичокx", "новички", "любитель", "средний", "профессионал", "опытный", "pro"])(
    "does not invent skill evidence for %j", (source) => {
      expect(resolveSkillApplicabilityTruth(source, context)).toMatchObject({
        value: null, evidence: { state: "unknown", method: null },
      });
    },
  );

  it.each([
    ["", null, "unknown"],
    ["6", 6, "known"],
    ["7.6", 7.6, "known"],
    ["6 из 10", 6, "known"],
    ["6/10", 6, "known"],
    ["Жёсткие", 8, "known"],
    ["мягкий", 3, "known"],
    ["5-6", null, "ambiguous"],
    ["мягкая-средняя", null, "ambiguous"],
  ])("resolves flex truth from %j", (source, value, state) => {
    expect(resolveFlexTruth(source, context)).toMatchObject({
      value,
      evidence: { state },
    });
  });

  it.each([
    ["men", "men"],
    ["male", "men"],
    ["мужской", "men"],
    ["для мужчин", "men"],
    ["women", "women"],
    ["female", "women"],
    ["женская", "women"],
    ["для женщин", "women"],
    ["Девочки", "women"],
    ["unisex", "unisex"],
    ["унисекс", "unisex"],
  ])("resolves explicit board-line evidence from %j", (source, value) => {
    expect(resolveBoardLineTruth(source, context)).toMatchObject({
      value,
      evidence: { state: "known" },
    });
  });

  it.each([
    "мужчины и женщины",
    "мужская женская",
    "men women",
    "male female",
    "unisex men",
    "унисекс женская",
  ])("keeps conflicting board-line evidence ambiguous for %j", (source) => {
    expect(resolveBoardLineTruth(source, context)).toMatchObject({
      value: null,
      evidence: { state: "ambiguous" },
    });
  });

  it.each(["", "kids", "junior", "youth", "детская", "для детей"])(
    "keeps unsupported board-line evidence unknown for %j",
    (source) => {
      expect(resolveBoardLineTruth(source, context)).toMatchObject({
        value: null,
        evidence: { state: "unknown" },
      });
    },
  );

  it("keeps shape/camber evidence explicit and bounded", () => {
    expect(resolveShapeTruth("Directional Twin", context)).toMatchObject({ value: "directional-twin" });
    expect(resolveCamberTruth("", context).value).toBeNull();
    expect(
      knownTruth("men", { ...context, sourceName: "x".repeat(500), sourceUrl: "not a url" }),
    ).toMatchObject({ evidence: { sourceName: "x".repeat(200), sourceUrl: null } });
  });
});

function productTruth({ styles = ["all-mountain"], flex = 6, suffix = "a" } = {}) {
  const local = { ...context, sourceName: `Merchant ${suffix}` };
  return buildProductTruthV2({
    ridingStyles: styles == null
      ? resolveRidingStylesTruth("", local)
      : knownTruth(styles, local),
    skillApplicability: resolveSkillApplicabilityTruth("", local),
    boardLine: resolveBoardLineTruth("", local),
    flex: flex == null ? resolveFlexTruth("", local) : knownTruth(flex, local),
    shapeType: resolveShapeTruth("", local),
    camberProfile: resolveCamberTruth("", local),
  });
}

describe("truth-v2 contract and merge", () => {
  it("matches legacy width thresholds without importing legacy fallbacks", () => {
    for (const width of [120, 256, 257, 263, 264, 340]) {
      expect(classifyTruthWidthType(width)).toBe(classifyWidthType(width));
    }
  });

  it("validates exact size truth and nullable unknown geometry", () => {
    expect(buildSizeTruthV2(knownTruth(264, context))).toMatchObject({ waistWidthMm: 264, widthType: "wide" });
    expect(buildSizeTruthV2(resolveFlexTruth("", context))).toMatchObject({ waistWidthMm: null, widthType: null });
  });

  it("merges known and unknown without inventing values", () => {
    expect(mergeProductTruthV2(productTruth(), productTruth({ styles: null, flex: null })).ridingStyles)
      .toEqual(["all-mountain"]);
    expect(mergeProductTruthV2(productTruth({ styles: null }), productTruth()).ridingStyles)
      .toEqual(["all-mountain"]);
    expect(mergeProductTruthV2(productTruth({ styles: null }), productTruth({ styles: null })).ridingStyles)
      .toBeNull();
  });

  it("turns conflicting known styles into ambiguity instead of a union", () => {
    const merged = mergeProductTruthV2(
      productTruth({ styles: ["all-mountain"], suffix: "b" }),
      productTruth({ styles: ["freeride"], suffix: "a" }),
    );
    expect(merged.ridingStyles).toBeNull();
    expect(merged.attributeEvidence.ridingStyles).toMatchObject({ state: "ambiguous", method: null });
  });

  it("preserves ambiguity when the other source is unknown", () => {
    const ambiguous = productTruth({ styles: null });
    ambiguous.attributeEvidence.ridingStyles.state = "ambiguous";
    const merged = mergeProductTruthV2(ambiguous, productTruth({ styles: null }));
    expect(merged.ridingStyles).toBeNull();
    expect(merged.attributeEvidence.ridingStyles.state).toBe("ambiguous");
  });

  it("chooses deterministic evidence for equal known values", () => {
    const leftRight = mergeProductTruthV2(productTruth({ suffix: "z" }), productTruth({ suffix: "a" }));
    const rightLeft = mergeProductTruthV2(productTruth({ suffix: "a" }), productTruth({ suffix: "z" }));
    expect(leftRight).toEqual(rightLeft);
  });

  it("rejects value/evidence disagreement", () => {
    const invalid = structuredClone(productTruth());
    invalid.flex = null;
    expect(() => assertProductTruthV2(invalid)).toThrow(/mismatch/u);
  });

  it("rejects importer-only or arbitrary persisted fields", () => {
    const invalid = structuredClone(productTruth());
    invalid.attributeEvidence.flex.reason = "raw importer reason";
    expect(() => assertProductTruthV2(invalid)).toThrow(/evidence/u);
  });
});
