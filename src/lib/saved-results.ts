import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { получитьКлиентБазы } from "@/lib/database/client";
import { базаНастроена } from "@/lib/database/config";
import { isSavedResultToken } from "@/lib/saved-result-contract";
import type { RecommendationResult } from "@/types/domain";
import {
  EMPTY_PURCHASE_PREFERENCES,
  purchasePreferencesSchema,
  type PurchasePreferences,
} from "@/lib/purchase-preferences";

const ridingStyleSchema = z.enum(["all-mountain", "park", "freeride"]);
const skillLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
const aggressivenessSchema = z.enum(["relaxed", "balanced", "aggressive"]);
const stanceTypeSchema = z.enum(["standard", "duck", "unknown"]);
const widthTypeSchema = z.enum(["regular", "mid-wide", "wide"]);
const bootDragRiskSchema = z.enum(["low", "medium", "high"]);
const boardLinePreferenceSchema = z.enum(["men", "women", "any"]);
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
const terrainPrioritySchema = z.enum([
  "balanced",
  "switch-freestyle",
  "groomers-carving",
  "soft-snow",
]);
const productSizeSchema = z
  .object({
    sizeCm: z.number(),
    sizeLabel: z.string().nullable().optional(),
    waistWidthMm: z.number(),
    recommendedWeightMin: z.number(),
    recommendedWeightMax: z.number().nullable(),
    widthType: widthTypeSchema,
    isAvailable: z.boolean(),
  })
  .strict();
const productSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    brand: z.string(),
    modelName: z.string(),
    seasonLabel: z.string().nullable().optional(),
    descriptionShort: z.string(),
    descriptionFull: z.string(),
    ridingStyle: ridingStyleSchema,
    skillLevel: skillLevelSchema,
    flex: z.number(),
    priceFrom: z.number(),
    imageUrl: z.string(),
    galleryImages: z.array(z.string()).optional(),
    affiliateUrl: z.string(),
    isActive: z.boolean(),
    boardLine: z.enum(["men", "women", "unisex"]),
    shapeType: boardShapeSchema.nullable(),
    camberProfile: camberProfileSchema.nullable().optional(),
    dataStatus: z.enum(["draft", "verified"]),
    sourceName: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    sourceCheckedAt: z.string().nullable(),
    scenarios: z.array(z.string()),
    notIdealFor: z.array(z.string()),
    sizes: z.array(productSizeSchema),
  })
  .strict();
const recommendationMatchSchema = z
  .object({
    product: productSchema,
    size: productSizeSchema,
    score: z.number(),
    fitLabel: z.string(),
    role: z.enum(["best-overall", "playful", "stable", "width-safe"]),
    confidence: z.enum(["high", "medium", "careful"]),
    confidenceLabel: z.string(),
    isCatalogReady: z.boolean(),
    reasons: z.array(z.string()),
  })
  .strict();
const recommendationResultSchema = z
  .object({
    algorithmVersion: z.string(),
    input: z
      .object({
        heightCm: z.number(),
        weightKg: z.number(),
        bootSizeEu: z.number(),
        boardLinePreference: boardLinePreferenceSchema,
        skillLevel: skillLevelSchema,
        ridingStyle: ridingStyleSchema,
        terrainPriority: terrainPrioritySchema,
        aggressiveness: aggressivenessSchema,
        stanceType: stanceTypeSchema,
      })
      .strict(),
    lengthRange: z.object({ min: z.number(), max: z.number() }).strict(),
    recommendedWidthType: widthTypeSchema,
    shapeProfile: z
      .object({
        primary: boardShapeSchema,
        alternatives: z.array(boardShapeSchema),
        headline: z.string(),
        description: z.string(),
      })
      .strict(),
    targetWaistWidthMm: z.number(),
    bootDragRisk: bootDragRiskSchema,
    explanation: z.array(z.string()),
    recommendedBoards: z.array(recommendationMatchSchema),
    avoidBoards: z.array(recommendationMatchSchema),
  })
  .strict();

const savedResultSnapshotV2Schema = z.strictObject({
  snapshotVersion: z.literal(2),
  recommendation: recommendationResultSchema,
  purchasePreferences: purchasePreferencesSchema,
});

export interface SavedResultSnapshot {
  recommendation: RecommendationResult;
  purchasePreferences: PurchasePreferences;
}

export class SavedResultUnavailableError extends Error {
  constructor() {
    super("Saved result is temporarily unavailable.");
    this.name = "SavedResultUnavailableError";
  }
}

export function isSavedResultsEnabled(
  value = process.env.SAVED_RESULTS_ENABLED,
) {
  return value?.trim().toLowerCase() === "true";
}

export function generateSavedResultToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSavedResultToken(token: string) {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

export function isRecommendationResultSnapshot(
  value: unknown,
): value is RecommendationResult {
  return recommendationResultSchema.safeParse(value).success;
}

export function parseSavedResultSnapshot(
  value: unknown,
): SavedResultSnapshot | null {
  const legacyResult = recommendationResultSchema.safeParse(value);
  if (legacyResult.success) {
    return {
      recommendation: legacyResult.data,
      purchasePreferences: EMPTY_PURCHASE_PREFERENCES,
    };
  }

  const versionedResult = savedResultSnapshotV2Schema.safeParse(value);
  if (!versionedResult.success) {
    return null;
  }

  return {
    recommendation: versionedResult.data.recommendation,
    purchasePreferences: versionedResult.data.purchasePreferences,
  };
}

export async function loadSavedResultByToken(token: string) {
  if (!isSavedResultsEnabled() || !isSavedResultToken(token)) {
    return null;
  }

  if (!базаНастроена()) {
    throw new SavedResultUnavailableError();
  }

  try {
    const sql = получитьКлиентБазы();
    const rows = await sql<{ resultSnapshot: unknown }[]>`
      select result_snapshot as "resultSnapshot"
      from quiz_results
      where public_token_hash = ${hashSavedResultToken(token)}
      limit 1
    `;
    const snapshot = rows[0]?.resultSnapshot;

    return parseSavedResultSnapshot(snapshot);
  } catch {
    throw new SavedResultUnavailableError();
  }
}

export async function loadSavedRecommendationByToken(token: string) {
  const savedResult = await loadSavedResultByToken(token);
  return savedResult?.recommendation ?? null;
}
