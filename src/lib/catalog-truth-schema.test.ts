import { describe, expect, it } from "vitest";
import { classifyWidthType as classifyImporterWidthType } from "../../scripts/lib/store-import/common.mjs";
import {
  attributeEvidenceSchema,
  canonicalizeKnownRidingStyles,
  classifyCatalogTruthWidthType,
  productSizeTruthV2Schema,
  productTruthV2Schema,
} from "@/lib/catalog-truth-schema";
import type {
  AttributeEvidence,
  ProductSizeTruthV2,
  ProductTruthV2,
} from "@/types/catalog-truth";

function evidence(
  overrides: Partial<AttributeEvidence> = {},
): AttributeEvidence {
  return {
    state: "known",
    provenance: "merchant",
    method: "explicit",
    sourceName: "fixture-source",
    sourceUrl: "https://example.test/board",
    observedAt: "2026-08-30",
    sourceField: "fixture-field",
    ...overrides,
  };
}

function unknownEvidence(
  overrides: Partial<AttributeEvidence> = {},
): AttributeEvidence {
  return evidence({
    state: "unknown",
    method: null,
    sourceField: null,
    ...overrides,
  });
}

function productTruth(): ProductTruthV2 {
  return {
    truthModelVersion: 2,
    ridingStyles: ["all-mountain"],
    skillApplicability: { min: "beginner", max: "advanced" },
    boardLine: "unisex",
    flex: 5.5,
    shapeType: "directional-twin",
    camberProfile: "hybrid-camber",
    attributeEvidence: {
      ridingStyles: evidence({ sourceField: "style" }),
      skillApplicability: evidence({ sourceField: "skill" }),
      boardLine: evidence({ sourceField: "line" }),
      flex: evidence({ sourceField: "flex", sourceScaleMax: 10 }),
      shapeType: evidence({ sourceField: "shape" }),
      camberProfile: evidence({ sourceField: "camber" }),
    },
  };
}

function sizeTruth(
  waistWidthMm: number | null = 257,
): ProductSizeTruthV2 {
  const known = waistWidthMm != null;
  return {
    truthModelVersion: 2,
    waistWidthMm,
    widthType: known ? classifyCatalogTruthWidthType(waistWidthMm) : null,
    attributeEvidence: {
      waistWidthMm: known
        ? evidence({ sourceField: "waist" })
        : unknownEvidence(),
      widthType: known
        ? evidence({ method: "derived", sourceField: "waist" })
        : unknownEvidence(),
    },
  };
}

describe("catalog truth v2 product validation", () => {
  it("accepts one or multiple riding styles in canonical order", () => {
    expect(productTruthV2Schema.safeParse(productTruth()).success).toBe(true);

    const multiple = productTruth();
    multiple.ridingStyles = ["all-mountain", "park", "freeride"];
    expect(productTruthV2Schema.safeParse(multiple).success).toBe(true);
  });

  it("canonicalizes, deduplicates, and rejects ambiguous arrays", () => {
    expect(
      canonicalizeKnownRidingStyles([
        "freeride",
        "park",
        "all-mountain",
        "park",
      ]),
    ).toEqual(["all-mountain", "park", "freeride"]);
    expect(() => canonicalizeKnownRidingStyles([])).toThrow(RangeError);

    const duplicate = productTruth();
    duplicate.ridingStyles = ["park", "park"];
    expect(productTruthV2Schema.safeParse(duplicate).success).toBe(false);

    const wrongOrder = productTruth();
    wrongOrder.ridingStyles = ["freeride", "all-mountain"];
    expect(productTruthV2Schema.safeParse(wrongOrder).success).toBe(false);

    const empty = { ...productTruth(), ridingStyles: [] };
    expect(productTruthV2Schema.safeParse(empty).success).toBe(false);
  });

  it("represents unknown riding styles as null with unknown evidence", () => {
    const truth = productTruth();
    truth.ridingStyles = null;
    truth.attributeEvidence.ridingStyles = unknownEvidence();
    expect(productTruthV2Schema.safeParse(truth).success).toBe(true);
  });

  it("accepts ordered and full skill ranges, but rejects partial or reversed ranges", () => {
    for (const range of [
      { min: "beginner", max: "beginner" },
      { min: "beginner", max: "advanced" },
      { min: "intermediate", max: "advanced" },
    ] as const) {
      const truth = productTruth();
      truth.skillApplicability = range;
      expect(productTruthV2Schema.safeParse(truth).success).toBe(true);
    }

    const reversed = productTruth();
    reversed.skillApplicability = { min: "advanced", max: "beginner" };
    expect(productTruthV2Schema.safeParse(reversed).success).toBe(false);

    const partial = {
      ...productTruth(),
      skillApplicability: { min: "beginner" },
    };
    expect(productTruthV2Schema.safeParse(partial).success).toBe(false);

    const notApplicable = productTruth();
    notApplicable.skillApplicability = null;
    notApplicable.attributeEvidence.skillApplicability = unknownEvidence();
    expect(productTruthV2Schema.safeParse(notApplicable).success).toBe(true);
  });

  it("accepts finite decimal flex within 1..10 and nullable missing flex", () => {
    for (const flex of [1, 3.5, 10]) {
      const truth = productTruth();
      truth.flex = flex;
      expect(productTruthV2Schema.safeParse(truth).success).toBe(true);
    }

    for (const flex of [0, 10.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const truth = productTruth();
      truth.flex = flex;
      expect(productTruthV2Schema.safeParse(truth).success).toBe(false);
    }

    const missing = productTruth();
    missing.flex = null;
    missing.attributeEvidence.flex = unknownEvidence();
    expect(productTruthV2Schema.safeParse(missing).success).toBe(true);
  });

  it("enforces normalized value and evidence coherence", () => {
    const valueWithoutEvidence = productTruth();
    valueWithoutEvidence.boardLine = "men";
    valueWithoutEvidence.attributeEvidence.boardLine = unknownEvidence();
    expect(productTruthV2Schema.safeParse(valueWithoutEvidence).success).toBe(
      false,
    );

    const evidenceWithoutValue = productTruth();
    evidenceWithoutValue.shapeType = null;
    expect(productTruthV2Schema.safeParse(evidenceWithoutValue).success).toBe(
      false,
    );

    expect(
      attributeEvidenceSchema.safeParse(evidence({ method: null })).success,
    ).toBe(false);
    expect(attributeEvidenceSchema.safeParse(unknownEvidence()).success).toBe(
      true,
    );
    expect(
      attributeEvidenceSchema.safeParse(
        unknownEvidence({
          provenance: "legacy",
          method: "legacy-unverified",
        }),
      ).success,
    ).toBe(true);
    expect(
      attributeEvidenceSchema.safeParse({
        ...unknownEvidence(),
        state: "missing",
      }).success,
    ).toBe(false);
    expect(
      attributeEvidenceSchema.safeParse(
        evidence({ provenance: "manual", method: "manual-override" }),
      ).success,
    ).toBe(true);
  });

  it.each(["missing source information", "unrecognized source information"])(
    "persists %s as unknown without adding an importer reason",
    () => {
      const truth = productTruth();
      truth.camberProfile = null;
      truth.attributeEvidence.camberProfile = unknownEvidence();

      const parsed = productTruthV2Schema.parse(truth);
      expect(parsed.attributeEvidence.camberProfile).toMatchObject({
        state: "unknown",
        method: null,
      });
      expect(parsed.attributeEvidence.camberProfile).not.toHaveProperty(
        "reason",
      );
    },
  );

  it("accepts null with ambiguous evidence", () => {
    const truth = productTruth();
    truth.shapeType = null;
    truth.attributeEvidence.shapeType = evidence({
      state: "ambiguous",
      method: null,
    });

    expect(productTruthV2Schema.safeParse(truth).success).toBe(true);
  });

  it("serializes only the strict bounded truth contract", () => {
    const truth = productTruth();
    const parsed = productTruthV2Schema.parse(truth);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);

    expect(
      productTruthV2Schema.safeParse({
        ...truth,
        recommendationTrusted: true,
      }).success,
    ).toBe(false);
    expect(
      attributeEvidenceSchema.safeParse({
        ...evidence(),
        rawMerchantPayload: { secret: "not allowed" },
      }).success,
    ).toBe(false);
  });
});

describe("catalog truth v2 size validation", () => {
  it.each([
    [256, "regular"],
    [257, "mid-wide"],
    [263, "mid-wide"],
    [264, "wide"],
  ] as const)("classifies %i mm as %s", (waist, expected) => {
    expect(classifyCatalogTruthWidthType(waist)).toBe(expected);
    expect(classifyImporterWidthType(waist)).toBe(expected);
    expect(productSizeTruthV2Schema.safeParse(sizeTruth(waist)).success).toBe(
      true,
    );
  });

  it("accepts wholly unknown geometry with unknown evidence", () => {
    expect(productSizeTruthV2Schema.safeParse(sizeTruth(null)).success).toBe(
      true,
    );
  });

  it("rejects partial, mismatched, non-integral, and implausible geometry", () => {
    expect(
      productSizeTruthV2Schema.safeParse({
        ...sizeTruth(257),
        widthType: null,
        attributeEvidence: {
          waistWidthMm: evidence(),
          widthType: unknownEvidence(),
        },
      }).success,
    ).toBe(false);
    expect(
      productSizeTruthV2Schema.safeParse({
        ...sizeTruth(257),
        widthType: "wide",
      }).success,
    ).toBe(false);

    for (const waistWidthMm of [119, 220.5, 341, Number.NaN]) {
      expect(
        productSizeTruthV2Schema.safeParse({
          ...sizeTruth(257),
          waistWidthMm,
        }).success,
      ).toBe(false);
    }
  });
});
