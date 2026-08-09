import { createHash } from "node:crypto";
import {
  detectWidthMarker,
  normalizeBrand,
  normalizeModelName,
  normalizeSeason,
} from "../audit-model-families.mjs";

export const BACKFILL_VERSION = "model-family-backfill-v1";
export const AUDIT_RULE = "audit-high-v1";
export const MATCH_CONFIDENCE = "high";
export const CANONICAL_SOURCE_KIND = "fallback-member";
export const MATCH_REASON =
  "Task012B HIGH: same normalized brand/base model after explicit terminal WIDE removal; same known season; compatible metadata; Wide size evidence.";

function text(value) {
  return String(value ?? "").trim();
}

function nullable(value) {
  return value == null || value === "" ? null : value;
}

function compareText(left, right) {
  return text(left).localeCompare(text(right), "en");
}

export function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function hashCanonicalValue(value) {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function identifyMembers(family) {
  if (!Array.isArray(family.members) || family.members.length !== 2) {
    throw new Error(`Family ${family.id ?? "unknown"} must contain exactly two members.`);
  }

  const baseMembers = family.members.filter(
    (member) => detectWidthMarker(member.modelName).kind === "base",
  );
  const wideMembers = family.members.filter(
    (member) => detectWidthMarker(member.modelName).kind === "explicit-wide",
  );

  if (baseMembers.length !== 1 || wideMembers.length !== 1) {
    throw new Error(
      `Family ${family.id ?? "unknown"} must contain one clean base and one explicit Wide member.`,
    );
  }

  return { base: baseMembers[0], wide: wideMembers[0] };
}

export function buildApprovedIdentityEntries(analysis) {
  return analysis.highConfidenceWidthFamilies
    .map((family) => {
      const { base, wide } = identifyMembers(family);
      return {
        brand: normalizeBrand(family.brand),
        model: family.canonicalCandidateModelName,
        season: family.normalizedSeason,
        baseSlug: base.slug,
        wideSlug: wide.slug,
      };
    })
    .sort((left, right) =>
      [left.brand, left.model, left.season, left.baseSlug, left.wideSlug]
        .join("|")
        .localeCompare(
          [right.brand, right.model, right.season, right.baseSlug, right.wideSlug].join(
            "|",
          ),
          "en",
        ),
    );
}

export function getApprovedIdentityFingerprint(analysis) {
  return hashCanonicalValue(buildApprovedIdentityEntries(analysis));
}

function buildFamilyProposal(family, productById) {
  if (family.classification !== "HIGH_CONFIDENCE_WIDTH_FAMILY") {
    throw new Error(`Family ${family.id ?? "unknown"} is not HIGH confidence.`);
  }

  const { base, wide } = identifyMembers(family);
  const baseProduct = productById.get(String(base.id));
  const wideProduct = productById.get(String(wide.id));

  if (!baseProduct || !wideProduct) {
    throw new Error(`Family ${family.id} references a Product missing from the catalog load.`);
  }

  const normalizedBrand = normalizeBrand(baseProduct.brand);
  const normalizedBaseModel = normalizeModelName(baseProduct.modelName);
  const normalizedBaseSeason = normalizeSeason(baseProduct.seasonLabel);
  const normalizedWideSeason = normalizeSeason(wideProduct.seasonLabel);
  const wideMarker = detectWidthMarker(wideProduct.modelName);

  if (
    normalizedBrand !== normalizeBrand(wideProduct.brand) ||
    normalizedBrand !== normalizeBrand(family.brand)
  ) {
    throw new Error(`Family ${family.id} has inconsistent normalized brands.`);
  }
  if (
    normalizedBaseModel !== family.canonicalCandidateModelName ||
    wideMarker.baseModelName !== normalizedBaseModel
  ) {
    throw new Error(`Family ${family.id} has inconsistent normalized model identity.`);
  }
  if (
    !normalizedBaseSeason ||
    !normalizedWideSeason ||
    normalizedBaseSeason !== normalizedWideSeason ||
    normalizedBaseSeason !== family.normalizedSeason
  ) {
    throw new Error(`Family ${family.id} must have one matching known season.`);
  }

  const identityKey = `v1|${normalizedBrand}|${normalizedBaseModel}|${normalizedBaseSeason}`;
  const canonicalFamily = {
    descriptionShort: nullable(baseProduct.descriptionShort),
    descriptionFull: nullable(baseProduct.descriptionFull),
    ridingStyle: nullable(baseProduct.ridingStyle),
    skillLevel: nullable(baseProduct.skillLevel),
    flex: baseProduct.flex == null ? null : Number(baseProduct.flex),
    boardLine: nullable(baseProduct.boardLine),
    shapeType: nullable(baseProduct.shapeType),
    camberProfile: nullable(baseProduct.camberProfile),
    canonicalSourceKind: CANONICAL_SOURCE_KIND,
    canonicalSourceName: nullable(baseProduct.sourceName),
    canonicalSourceUrl: nullable(baseProduct.sourceUrl),
    canonicalSourceCheckedAt: nullable(baseProduct.sourceCheckedAt),
    canonicalDataStatus: baseProduct.dataStatus,
  };

  const memberProposals = [
    { product: baseProduct, role: "base" },
    { product: wideProduct, role: "wide" },
  ]
    .map(({ product, role }) => ({
      productId: String(product.id),
      productSlug: product.slug,
      role,
      matchMethod: AUDIT_RULE,
      confidence: MATCH_CONFIDENCE,
      manualOverride: false,
      reason: MATCH_REASON,
    }))
    .sort((left, right) => compareText(left.productSlug, right.productSlug));

  return {
    identityKey,
    slug: baseProduct.slug,
    brand: baseProduct.brand,
    modelName: baseProduct.modelName,
    seasonLabel: normalizedBaseSeason,
    baseProductId: String(baseProduct.id),
    baseProductSlug: baseProduct.slug,
    wideProductId: String(wideProduct.id),
    wideProductSlug: wideProduct.slug,
    canonicalMetadataSource: {
      kind: CANONICAL_SOURCE_KIND,
      productId: String(baseProduct.id),
      productSlug: baseProduct.slug,
    },
    canonicalFamily,
    memberProposals,
  };
}

export function buildBackfillLogicalPlan({
  analysis,
  products,
  baselineRepositorySha,
  snapshot,
}) {
  const productById = new Map(products.map((product) => [String(product.id), product]));
  const families = analysis.highConfidenceWidthFamilies
    .map((family) => buildFamilyProposal(family, productById))
    .sort((left, right) =>
      [
        normalizeBrand(left.brand),
        normalizeModelName(left.modelName),
        left.seasonLabel,
        left.slug,
      ]
        .join("|")
        .localeCompare(
          [
            normalizeBrand(right.brand),
            normalizeModelName(right.modelName),
            right.seasonLabel,
            right.slug,
          ].join("|"),
          "en",
        ),
    );

  const productIds = families.flatMap((family) =>
    family.memberProposals.map((member) => member.productId),
  );
  const duplicateProductIds = productIds.filter(
    (productId, index) => productIds.indexOf(productId) !== index,
  );
  if (duplicateProductIds.length > 0) {
    throw new Error(
      `Products appear in multiple HIGH families: ${[...new Set(duplicateProductIds)].join(", ")}.`,
    );
  }

  const identityKeys = families.map((family) => family.identityKey);
  const slugs = families.map((family) => family.slug);
  if (new Set(identityKeys).size !== identityKeys.length) {
    throw new Error("Proposed family identity keys are not unique.");
  }
  if (new Set(slugs).size !== slugs.length) {
    throw new Error("Proposed family slugs are not unique.");
  }

  return {
    version: BACKFILL_VERSION,
    auditRule: AUDIT_RULE,
    baselineRepositorySha,
    catalogSnapshot: { ...snapshot },
    auditSummary: {
      highConfidenceWidthFamilies:
        analysis.summary.highConfidenceWidthFamilyCount,
      reviewWidthFamilies: analysis.summary.reviewWidthFamilyCount,
      keepSeparate: analysis.summary.keepSeparateCount,
      exactOrCrossStoreDuplicates:
        analysis.summary.exactOrCrossStoreDuplicateCount,
      uniqueHighProducts: new Set(productIds).size,
    },
    approvedIdentityFingerprint: getApprovedIdentityFingerprint(analysis),
    families,
  };
}

export function buildPlanArtifact(logicalPlan, generatedAt) {
  return {
    ...logicalPlan,
    generatedAt,
    planHash: hashCanonicalValue(logicalPlan),
  };
}

export function extractLogicalPlan(planArtifact) {
  const logicalPlan = { ...planArtifact };
  delete logicalPlan.generatedAt;
  delete logicalPlan.planHash;
  return logicalPlan;
}

export function validatePlanArtifact(planArtifact) {
  if (!planArtifact || typeof planArtifact !== "object") {
    throw new Error("Backfill plan is not a JSON object.");
  }
  if (!text(planArtifact.generatedAt) || !text(planArtifact.planHash)) {
    throw new Error("Backfill plan is missing generatedAt or planHash.");
  }

  const logicalPlan = extractLogicalPlan(planArtifact);
  const calculatedHash = hashCanonicalValue(logicalPlan);
  if (calculatedHash !== planArtifact.planHash) {
    throw new Error("Backfill plan hash is invalid.");
  }
  if (logicalPlan.version !== BACKFILL_VERSION || logicalPlan.auditRule !== AUDIT_RULE) {
    throw new Error("Backfill plan version or audit rule is unsupported.");
  }

  return logicalPlan;
}

function normalizeExistingFamily(family) {
  return {
    identityKey: family.identityKey,
    slug: family.slug,
    brand: family.brand,
    modelName: family.modelName,
    seasonLabel: family.seasonLabel,
    canonicalFamily: { ...family.canonicalFamily },
    members: [...family.members]
      .map((member) => ({
        productId: String(member.productId),
        productSlug: member.productSlug,
        role: member.role,
        matchMethod: member.matchMethod,
        confidence: member.confidence,
        manualOverride: member.manualOverride,
        reason: member.reason,
      }))
      .sort((left, right) => compareText(left.productSlug, right.productSlug)),
  };
}

function normalizeExpectedFamily(family) {
  return {
    identityKey: family.identityKey,
    slug: family.slug,
    brand: family.brand,
    modelName: family.modelName,
    seasonLabel: family.seasonLabel,
    canonicalFamily: { ...family.canonicalFamily },
    members: family.memberProposals.map((member) => ({ ...member })),
  };
}

export function compareExistingBackfillState(logicalPlan, existingFamilies) {
  if (existingFamilies.length === 0) {
    return { status: "EMPTY", reasons: [], matchedAt: null };
  }

  const expectedByIdentity = new Map(
    logicalPlan.families.map((family) => [family.identityKey, family]),
  );
  const reasons = [];
  const matchedAtValues = new Set();

  if (existingFamilies.length !== logicalPlan.families.length) {
    reasons.push(
      `Existing family count ${existingFamilies.length} does not match ${logicalPlan.families.length}.`,
    );
  }

  for (const existingFamily of existingFamilies) {
    const expectedFamily = expectedByIdentity.get(existingFamily.identityKey);
    if (!expectedFamily) {
      reasons.push(`Unexpected existing family ${existingFamily.identityKey}.`);
      continue;
    }

    if (
      canonicalStringify(normalizeExistingFamily(existingFamily)) !==
      canonicalStringify(normalizeExpectedFamily(expectedFamily))
    ) {
      reasons.push(`Existing family ${existingFamily.identityKey} is not an exact match.`);
    }

    for (const member of existingFamily.members) {
      if (!text(member.matchedAt)) {
        reasons.push(`Membership ${member.productId} has no matched_at timestamp.`);
      } else {
        matchedAtValues.add(String(member.matchedAt));
      }
    }
  }

  if (matchedAtValues.size !== 1) {
    reasons.push("Existing memberships do not share one stable matched_at timestamp.");
  }

  return {
    status: reasons.length === 0 ? "NOOP" : "CONFLICT",
    reasons,
    matchedAt: matchedAtValues.size === 1 ? [...matchedAtValues][0] : null,
  };
}
