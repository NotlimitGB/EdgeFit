import { z } from "zod";
import type {
  AttributeEvidence,
  KnownRidingStyles,
  ProductSizeTruthV2,
  ProductTruthV2,
} from "@/types/catalog-truth";
import type { RidingStyle, WidthType } from "@/types/domain";

const RIDING_STYLE_ORDER = ["all-mountain", "park", "freeride"] as const;
const SKILL_LEVEL_ORDER = ["beginner", "intermediate", "advanced"] as const;

const ridingStyleSchema = z.enum(RIDING_STYLE_ORDER);
const skillLevelSchema = z.enum(SKILL_LEVEL_ORDER);
const boardLineSchema = z.enum(["men", "women", "unisex"]);
const boardShapeSchema = z.enum([
  "twin",
  "asym-twin",
  "directional-twin",
  "directional",
  "tapered-directional",
]);
const camberProfileSchema = z.enum([
  "camber",
  "rocker",
  "flat",
  "hybrid-camber",
  "hybrid-rocker",
]);
const widthTypeSchema = z.enum(["regular", "mid-wide", "wide"]);

const boundedNullableText = z.string().trim().min(1).max(200).nullable();

export const attributeEvidenceSchema: z.ZodType<AttributeEvidence> = z
  .object({
    state: z.enum(["known", "missing", "ambiguous"]),
    provenance: z.enum(["manual", "official", "merchant", "legacy"]),
    method: z
      .enum([
        "explicit",
        "normalized",
        "derived",
        "manual-override",
        "legacy-unverified",
      ])
      .nullable(),
    sourceName: boundedNullableText,
    sourceUrl: z.string().trim().url().max(2048).nullable(),
    observedAt: z.string().trim().min(1).max(64).nullable(),
    sourceField: boundedNullableText,
    sourceScaleMax: z.number().finite().positive().max(1000).nullable().optional(),
    normalizationRule: boundedNullableText.optional(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.state === "known" && evidence.method == null) {
      context.addIssue({
        code: "custom",
        message: "Known attribute evidence must declare a method.",
        path: ["method"],
      });
    }
  });

const knownRidingStylesSchema = z
  .tuple([ridingStyleSchema])
  .rest(ridingStyleSchema)
  .superRefine((styles, context) => {
    if (new Set(styles).size !== styles.length) {
      context.addIssue({
        code: "custom",
        message: "Known riding styles must be unique.",
      });
    }

    const canonical = canonicalizeKnownRidingStyles(styles);
    if (canonical.some((style, index) => style !== styles[index])) {
      context.addIssue({
        code: "custom",
        message: "Known riding styles must use canonical order.",
      });
    }
  });

const skillApplicabilitySchema = z
  .object({
    min: skillLevelSchema,
    max: skillLevelSchema,
  })
  .strict()
  .superRefine((range, context) => {
    if (
      SKILL_LEVEL_ORDER.indexOf(range.min) >
      SKILL_LEVEL_ORDER.indexOf(range.max)
    ) {
      context.addIssue({
        code: "custom",
        message: "Skill applicability minimum must not exceed its maximum.",
      });
    }
  });

const productAttributeEvidenceSchema = z
  .object({
    ridingStyles: attributeEvidenceSchema,
    skillApplicability: attributeEvidenceSchema,
    boardLine: attributeEvidenceSchema,
    flex: attributeEvidenceSchema,
    shapeType: attributeEvidenceSchema,
    camberProfile: attributeEvidenceSchema,
  })
  .strict();

const productSizeAttributeEvidenceSchema = z
  .object({
    waistWidthMm: attributeEvidenceSchema,
    widthType: attributeEvidenceSchema,
  })
  .strict();

function validateValueEvidenceCoherence(
  value: unknown,
  evidence: AttributeEvidence,
  path: string,
  context: z.RefinementCtx,
) {
  const hasValue = value != null;
  if (hasValue && evidence.state !== "known") {
    context.addIssue({
      code: "custom",
      message: "A normalized value requires known evidence.",
      path: ["attributeEvidence", path],
    });
  }
  if (!hasValue && evidence.state === "known") {
    context.addIssue({
      code: "custom",
      message: "Known evidence requires a normalized value.",
      path: [path],
    });
  }
}

export function canonicalizeKnownRidingStyles(
  styles: readonly RidingStyle[],
): KnownRidingStyles {
  const selected = new Set(styles);
  const canonical = RIDING_STYLE_ORDER.filter((style) => selected.has(style));

  if (canonical.length === 0) {
    throw new RangeError("Known riding styles cannot be empty.");
  }

  const [first, ...rest] = canonical;
  return [first, ...rest];
}

export function classifyCatalogTruthWidthType(
  waistWidthMm: number,
): WidthType {
  if (waistWidthMm >= 264) {
    return "wide";
  }
  if (waistWidthMm >= 257) {
    return "mid-wide";
  }
  return "regular";
}

export const productTruthV2Schema: z.ZodType<ProductTruthV2> = z
  .object({
    truthModelVersion: z.literal(2),
    ridingStyles: knownRidingStylesSchema.nullable(),
    skillApplicability: skillApplicabilitySchema.nullable(),
    boardLine: boardLineSchema.nullable(),
    flex: z.number().finite().min(1).max(10).nullable(),
    shapeType: boardShapeSchema.nullable(),
    camberProfile: camberProfileSchema.nullable(),
    attributeEvidence: productAttributeEvidenceSchema,
  })
  .strict()
  .superRefine((truth, context) => {
    validateValueEvidenceCoherence(
      truth.ridingStyles,
      truth.attributeEvidence.ridingStyles,
      "ridingStyles",
      context,
    );
    validateValueEvidenceCoherence(
      truth.skillApplicability,
      truth.attributeEvidence.skillApplicability,
      "skillApplicability",
      context,
    );
    validateValueEvidenceCoherence(
      truth.boardLine,
      truth.attributeEvidence.boardLine,
      "boardLine",
      context,
    );
    validateValueEvidenceCoherence(
      truth.flex,
      truth.attributeEvidence.flex,
      "flex",
      context,
    );
    validateValueEvidenceCoherence(
      truth.shapeType,
      truth.attributeEvidence.shapeType,
      "shapeType",
      context,
    );
    validateValueEvidenceCoherence(
      truth.camberProfile,
      truth.attributeEvidence.camberProfile,
      "camberProfile",
      context,
    );
  });

export const productSizeTruthV2Schema: z.ZodType<ProductSizeTruthV2> = z
  .object({
    truthModelVersion: z.literal(2),
    waistWidthMm: z.number().finite().int().min(120).max(340).nullable(),
    widthType: widthTypeSchema.nullable(),
    attributeEvidence: productSizeAttributeEvidenceSchema,
  })
  .strict()
  .superRefine((truth, context) => {
    validateValueEvidenceCoherence(
      truth.waistWidthMm,
      truth.attributeEvidence.waistWidthMm,
      "waistWidthMm",
      context,
    );
    validateValueEvidenceCoherence(
      truth.widthType,
      truth.attributeEvidence.widthType,
      "widthType",
      context,
    );

    if ((truth.waistWidthMm == null) !== (truth.widthType == null)) {
      context.addIssue({
        code: "custom",
        message: "Waist width and width type must either both be known or both be null.",
        path: ["widthType"],
      });
    }

    if (
      truth.waistWidthMm != null &&
      truth.widthType !== classifyCatalogTruthWidthType(truth.waistWidthMm)
    ) {
      context.addIssue({
        code: "custom",
        message: "Width type does not match the known waist width.",
        path: ["widthType"],
      });
    }
  });
