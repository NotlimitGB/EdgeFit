import { createHash } from "node:crypto";
import {
  normalizeSeasonIdentity,
  normalizeWhitespace,
} from "./common.mjs";
import {
  buildSourceOfferIdentity,
  normalizeSourceIdentityText,
} from "./source-identity.mjs";

export const SOURCE_IDENTITY_AUTHORIZATION_VERSION =
  "catalog-source-identity-authorization-v1";

export const SOURCE_IDENTITY_DECISIONS = {
  auto: "AUTO",
  review: "REVIEW",
  block: "BLOCK",
};

export const SOURCE_IDENTITY_AUTHORIZATION_CODES = {
  blocked: "SOURCE_IDENTITY_BLOCKED",
  reviewRequired: "SOURCE_IDENTITY_REVIEW_REQUIRED",
  reviewHashMismatch: "SOURCE_IDENTITY_REVIEW_HASH_MISMATCH",
  staleReviewHash: "SOURCE_IDENTITY_REVIEW_HASH_STALE",
  malformedReviewHash: "SOURCE_IDENTITY_REVIEW_HASH_MALFORMED",
  diagnosticHashMismatch: "SOURCE_IDENTITY_DIAGNOSTIC_HASH_MISMATCH",
};

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const BOARD_LINES = new Set(["men", "women", "unisex"]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function hashProjection(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function toArray(value) {
  if (value instanceof Map) return [...value.values()];
  return Array.isArray(value) ? value : [];
}

function normalizeSeason(value) {
  const normalized = normalizeSeasonIdentity(value);
  return normalized ? normalizeSourceIdentityText(normalized) : null;
}

function protectedAudience(value) {
  const normalized = normalizeSourceIdentityText(value);
  if (!normalized) return "unknown";
  if (/\b(kid|kids|junior|youth|boy|boys|girl|girls|mini|child|children)\b/u.test(normalized)) {
    return "youth";
  }
  if (/\b(adult|adults)\b/u.test(normalized)) return "adult";
  return "unknown";
}

function currentEvidence(product) {
  const identity = buildSourceOfferIdentity(product);
  return {
    productId: product?.id ?? null,
    slug: normalizeWhitespace(product?.slug),
    sourceKey: product?.sourceIdentityKey ?? identity.key,
    normalizedBrand:
      product?.normalizedBrand ?? identity.normalizedBrand,
    normalizedModel:
      product?.normalizedModel ?? identity.normalizedModel,
    boardLine: product?.boardLine ?? identity.boardLine,
    boardLineEvidence:
      product?.boardLineEvidence ?? identity.boardLineEvidence,
    normalizedSeason: product?.season ?? identity.season,
    variantMarker: product?.variantMarker ?? identity.variantMarker,
    protectedAudience: protectedAudience(product?.modelName),
    isActive: Boolean(product?.isActive),
    familyManualOverride: Boolean(product?.familyManualOverride),
  };
}

function currentAuthorizationEvidence(product) {
  const evidence = currentEvidence(product);
  delete evidence.isActive;
  return evidence;
}

function normalizedBaseModel(value) {
  return String(value ?? "")
    .replace(/\bmid wide$/u, "")
    .replace(/\bwide$/u, "")
    .trim();
}

function memberEvidence(member) {
  return {
    sourceKey: member?.sourceIdentityKey ?? null,
    storeCode: member?.storeCode ?? null,
    sourceProductId: member?.sourceProductId ?? null,
    normalizedBrand: normalizeSourceIdentityText(member?.brand),
    normalizedModel: normalizeSourceIdentityText(member?.modelName),
    boardLine: BOARD_LINES.has(member?.boardLine) ? member.boardLine : "unisex",
    boardLineEvidence:
      member?.boardLineEvidence === "known" ? "known" : "missing",
    normalizedSeason: normalizeSeason(member?.season),
    variantMarker: member?.variantMarker ?? null,
    protectedAudience: protectedAudience(member?.modelName),
  };
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

function knownConflict(left, right, key) {
  return Boolean(left[key] && right[key] && left[key] !== right[key]);
}

function lineConflict(left, right) {
  return (
    left.boardLineEvidence === "known" &&
    right.boardLineEvidence === "known" &&
    left.boardLine !== right.boardLine
  );
}

function audienceConflict(left, right) {
  return (
    left.protectedAudience !== "unknown" &&
    right.protectedAudience !== "unknown" &&
    left.protectedAudience !== right.protectedAudience
  );
}

function samePublicIdentity(left, right) {
  return (
    left.normalizedBrand === right.normalizedBrand &&
    left.normalizedModel === right.normalizedModel &&
    !lineConflict(left, right) &&
    !knownConflict(left, right, "normalizedSeason") &&
    left.variantMarker === right.variantMarker &&
    !audienceConflict(left, right)
  );
}

function assignmentProjection(assignment, existingBySlug) {
  const owner = existingBySlug.get(assignment.slug);
  return {
    slug: assignment.slug,
    assignmentReason: assignment.reason,
    existingProductId: owner?.id ?? null,
    members: assignment.members
      .map(memberEvidence)
      .sort((left, right) =>
        String(left.sourceKey).localeCompare(String(right.sourceKey), "en", {
          numeric: true,
        }),
      ),
  };
}

function historicalProjection(group, existingBySlug) {
  const slugs = new Set([
    group.baseSlug,
    ...group.assignments.map((assignment) => assignment.slug),
  ]);
  return [...slugs]
    .map((slug) => existingBySlug.get(slug))
    .filter(Boolean)
    .map(currentAuthorizationEvidence)
    .sort((left, right) => left.slug.localeCompare(right.slug, "en"));
}

function addIdentityConflictReasons(blockReasons, current, proposed) {
  if (current.normalizedBrand !== proposed.normalizedBrand) {
    blockReasons.add("SOURCE_ID_REUSE_BRAND_CONFLICT");
  }
  if (current.normalizedModel !== proposed.normalizedModel) {
    blockReasons.add("SOURCE_ID_REUSE_MODEL_CONFLICT");
  }
  if (lineConflict(current, proposed)) {
    blockReasons.add("SOURCE_ID_REUSE_BOARD_LINE_CONFLICT");
  }
  if (knownConflict(current, proposed, "normalizedSeason")) {
    blockReasons.add("SOURCE_ID_REUSE_SEASON_CONFLICT");
  }
  if (current.variantMarker !== proposed.variantMarker) {
    blockReasons.add("SOURCE_ID_REUSE_VARIANT_CONFLICT");
  }
  if (audienceConflict(current, proposed)) {
    blockReasons.add("PROTECTED_AUDIENCE_COLLAPSE");
  }
}

function isExplicitProtectedSibling(owner, members) {
  return members.every((member) => {
    if (
      owner.normalizedBrand !== member.normalizedBrand ||
      normalizedBaseModel(owner.normalizedModel) !==
        normalizedBaseModel(member.normalizedModel)
    ) {
      return false;
    }
    return (
      lineConflict(owner, member) ||
      knownConflict(owner, member, "normalizedSeason") ||
      owner.variantMarker !== member.variantMarker ||
      audienceConflict(owner, member)
    );
  });
}

function getFreshHistoricalOwnerEvidence(group, historicalOwner) {
  if (!historicalOwner?.sourceKey) return null;

  const matches = (group.assignments ?? []).flatMap((assignment) =>
    assignment.slug === group.baseSlug
      ? assignment.members
          .map(memberEvidence)
          .filter((member) => member.sourceKey === historicalOwner.sourceKey)
      : [],
  );

  return matches.length === 1 ? matches[0] : null;
}

function hasCompleteMultiSourceEvidence(members) {
  if (members.length < 2) return true;
  const first = members[0];
  return members.every(
    (member) =>
      member.normalizedBrand === first.normalizedBrand &&
      member.normalizedModel === first.normalizedModel &&
      member.boardLineEvidence === "known" &&
      member.boardLine === first.boardLine &&
      member.normalizedSeason &&
      member.normalizedSeason === first.normalizedSeason &&
      member.variantMarker === first.variantMarker &&
      !audienceConflict(member, first),
  );
}

function summarizeDecisionGroups(groups) {
  const counts = { AUTO: 0, REVIEW: 0, BLOCK: 0 };
  const reasonCounts = {};
  for (const group of groups) {
    counts[group.decision] += 1;
    for (const reason of group.reasonCodes) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
  }
  return { counts, reasonCounts };
}

export function buildSourceIdentityAuthorizationPlan({
  identityPlan,
  importedProducts = [],
  existingProducts = [],
  officialSpecs = new Map(),
}) {
  const logicalPlan = identityPlan?.logicalPlan ?? {
    blockingIssues: [],
    groups: [],
  };
  const existing = toArray(existingProducts);
  const trustedEvidenceByKey = new Map();
  for (const product of toArray(importedProducts)) {
    const identity = buildSourceOfferIdentity(product);
    const evidence = product?.importMeta?.identityAuthorizationEvidence;
    if (
      identity.key &&
      (evidence === "trusted-alias" ||
        evidence === "merchant-canonical-replacement")
    ) {
      trustedEvidenceByKey.set(identity.key, evidence);
    }
  }
  const existingBySlug = new Map(existing.map((product) => [product.slug, product]));
  const existingEvidenceByKey = new Map();
  for (const product of existing) {
    const evidence = currentEvidence(product);
    if (!evidence.sourceKey) continue;
    const owners = existingEvidenceByKey.get(evidence.sourceKey) ?? [];
    owners.push(evidence);
    existingEvidenceByKey.set(evidence.sourceKey, owners);
  }

  const proposedAssignmentsByKey = new Map();
  for (const group of logicalPlan.groups ?? []) {
    for (const assignment of group.assignments ?? []) {
      for (const member of assignment.members ?? []) {
        if (!member.sourceIdentityKey) continue;
        const proposed = proposedAssignmentsByKey.get(member.sourceIdentityKey) ?? [];
        proposed.push({ baseSlug: group.baseSlug, slug: assignment.slug, member });
        proposedAssignmentsByKey.set(member.sourceIdentityKey, proposed);
      }
    }
  }

  const decisions = [];
  for (const group of logicalPlan.groups ?? []) {
    const autoReasons = new Set();
    const reviewReasons = new Set();
    const blockReasons = new Set();
    let hasExistingExactAssignment = false;
    let hasNewAssignment = false;

    for (const assignment of group.assignments ?? []) {
      const members = assignment.members.map(memberEvidence);
      const ownerProduct = existingBySlug.get(assignment.slug);
      const owner = ownerProduct ? currentEvidence(ownerProduct) : null;

      for (const member of members) {
        if (!member.sourceKey) blockReasons.add("MISSING_STABLE_SOURCE_IDENTITY");
        const proposedUses = proposedAssignmentsByKey.get(member.sourceKey) ?? [];
        const proposedSlugs = new Set(proposedUses.map((entry) => entry.slug));
        if (proposedSlugs.size > 1) {
          blockReasons.add("DUPLICATE_SOURCE_KEY_PROPOSAL");
        }
        const currentOwners = existingEvidenceByKey.get(member.sourceKey) ?? [];
        if (currentOwners.length > 1) {
          blockReasons.add("MULTIPLE_CLUSTERS_CLAIM_HISTORICAL_IDENTITY");
        }
        for (const currentOwner of currentOwners) {
          addIdentityConflictReasons(blockReasons, currentOwner, member);
          if (
            trustedEvidenceByKey.get(member.sourceKey) === "trusted-alias" &&
            currentOwner.normalizedBrand === member.normalizedBrand &&
            !lineConflict(currentOwner, member) &&
            !knownConflict(currentOwner, member, "normalizedSeason") &&
            currentOwner.variantMarker === member.variantMarker &&
            blockReasons.has("SOURCE_ID_REUSE_MODEL_CONFLICT")
          ) {
            blockReasons.delete("SOURCE_ID_REUSE_MODEL_CONFLICT");
            reviewReasons.add("SOURCE_IDENTITY_RENAME_REVIEW");
          }
        }
      }

      if (owner) {
        const exactMember = members.find(
          (member) => member.sourceKey && member.sourceKey === owner.sourceKey,
        );
        if (!exactMember) {
          if (owner.familyManualOverride) {
            blockReasons.add("MANUAL_IDENTITY_REASSIGNMENT");
          }
          if (owner.normalizedBrand !== members[0]?.normalizedBrand) {
            blockReasons.add("CROSS_BRAND_SLUG_COLLISION");
          } else {
            blockReasons.add("HISTORICAL_BASE_TAKEOVER");
          }
        } else {
          hasExistingExactAssignment = true;
          addIdentityConflictReasons(blockReasons, owner, exactMember);
          if (
            trustedEvidenceByKey.get(exactMember.sourceKey) === "trusted-alias" &&
            owner.normalizedBrand === exactMember.normalizedBrand &&
            !lineConflict(owner, exactMember) &&
            !knownConflict(owner, exactMember, "normalizedSeason") &&
            owner.variantMarker === exactMember.variantMarker &&
            blockReasons.has("SOURCE_ID_REUSE_MODEL_CONFLICT")
          ) {
            blockReasons.delete("SOURCE_ID_REUSE_MODEL_CONFLICT");
            reviewReasons.add("SOURCE_IDENTITY_RENAME_REVIEW");
          }
          if (
            owner.normalizedSeason &&
            !exactMember.normalizedSeason &&
            samePublicIdentity(owner, { ...exactMember, normalizedSeason: owner.normalizedSeason })
          ) {
            autoReasons.add("TRUSTED_EXISTING_IDENTITY_PRESERVED_WHEN_SOURCE_UNKNOWN");
          } else if (
            !owner.normalizedSeason &&
            exactMember.normalizedSeason &&
            samePublicIdentity({ ...owner, normalizedSeason: exactMember.normalizedSeason }, exactMember)
          ) {
            autoReasons.add("SOURCE_IDENTITY_ENRICHED_NO_OWNERSHIP_CHANGE");
          }
        }
      } else {
        hasNewAssignment = true;
        const historicalOwnerProduct = existingBySlug.get(group.baseSlug);
        const historicalOwner = historicalOwnerProduct
          ? currentEvidence(historicalOwnerProduct)
          : null;
        const protectedIdentityOwner =
          getFreshHistoricalOwnerEvidence(group, historicalOwner) ?? historicalOwner;
        if (
          assignment.slug !== group.baseSlug &&
          protectedIdentityOwner &&
          isExplicitProtectedSibling(protectedIdentityOwner, members)
        ) {
          autoReasons.add("NEW_PROTECTED_IDENTITY_SUFFIX");
        } else if (members.length > 1) {
          if (hasCompleteMultiSourceEvidence(members)) {
            autoReasons.add("NEW_CLEAN_MULTI_SOURCE");
          } else {
            reviewReasons.add("INCOMPLETE_CROSS_STORE_EVIDENCE_REVIEW");
          }
        } else if (
          assignment.slug !== group.baseSlug &&
          protectedIdentityOwner &&
          samePublicIdentity(protectedIdentityOwner, members[0])
        ) {
          reviewReasons.add("COLLISION_SUFFIX_REVIEW");
        } else {
          autoReasons.add("NEW_CLEAN_SINGLE_SOURCE");
        }
      }
    }

    if (
      group.officialSpecImpact &&
      group.officialSpecImpact.applicableAssignments.length === 0
    ) {
      blockReasons.add("OFFICIAL_IDENTITY_CONTRADICTION");
    }

    for (const current of group.currentProducts ?? []) {
      const evidence = currentEvidence(current);
      if (!evidence.familyManualOverride) continue;
      const retained = (group.assignments ?? []).some((assignment) =>
        assignment.members.some(
          (member) => member.sourceIdentityKey === evidence.sourceKey,
        ),
      );
      if (!retained) blockReasons.add("MANUAL_IDENTITY_REASSIGNMENT");
    }

    if (blockReasons.size === 0 && reviewReasons.size === 0) {
      if (
        group.repairRequired &&
        hasExistingExactAssignment &&
        !hasNewAssignment &&
        autoReasons.size === 0
      ) {
        autoReasons.add("STABLE_IDENTITY_COMMERCE_ONLY");
      } else if (autoReasons.size === 0) {
        autoReasons.add(
          group.sourceCount > 1
            ? "STABLE_MULTI_SOURCE_MEMBERSHIP"
            : "STABLE_PROTECTED_IDENTITIES",
        );
      }
    }

    const decision =
      blockReasons.size > 0
        ? SOURCE_IDENTITY_DECISIONS.block
        : reviewReasons.size > 0
          ? SOURCE_IDENTITY_DECISIONS.review
          : SOURCE_IDENTITY_DECISIONS.auto;
    const reasonCodes = sortedUnique(
      decision === SOURCE_IDENTITY_DECISIONS.block
        ? [...blockReasons]
        : decision === SOURCE_IDENTITY_DECISIONS.review
          ? [...reviewReasons]
          : [...autoReasons],
    );
    decisions.push({
      baseSlug: group.baseSlug,
      classification: group.classification,
      decision,
      reasonCodes,
      diagnosticEvidence: {
        repairRequired: Boolean(group.repairRequired),
        sourceCount: group.sourceCount,
        resolvedIdentityCount: group.resolvedIdentityCount,
        officialSpecImpact: group.officialSpecImpact ?? null,
        officialSpecPresent:
          officialSpecs instanceof Map
            ? officialSpecs.has(group.baseSlug)
            : false,
      },
      authorizationProjection: {
        baseSlug: group.baseSlug,
        classification: group.classification,
        decision,
        reasonCodes,
        current: (group.currentProducts ?? [])
          .map(currentAuthorizationEvidence)
          .sort((left, right) => left.slug.localeCompare(right.slug, "en")),
        proposed: (group.assignments ?? [])
          .map((assignment) => assignmentProjection(assignment, existingBySlug))
          .sort((left, right) => left.slug.localeCompare(right.slug, "en")),
        historicalOwnership: historicalProjection(group, existingBySlug),
      },
    });
  }

  for (const issue of logicalPlan.blockingIssues ?? []) {
    decisions.push({
      baseSlug: "__plan__",
      classification: "PLANNER_BLOCKING_ISSUE",
      decision: SOURCE_IDENTITY_DECISIONS.block,
      reasonCodes: ["PLANNER_BLOCKING_ISSUE"],
      diagnosticEvidence: { issue },
      authorizationProjection: {
        baseSlug: "__plan__",
        classification: "PLANNER_BLOCKING_ISSUE",
        decision: SOURCE_IDENTITY_DECISIONS.block,
        reasonCodes: ["PLANNER_BLOCKING_ISSUE"],
        issue,
        current: [],
        proposed: [],
        historicalOwnership: [],
      },
    });
  }

  decisions.sort((left, right) =>
    left.baseSlug.localeCompare(right.baseSlug, "en"),
  );
  const autoGroups = decisions.filter((group) => group.decision === "AUTO");
  const reviewGroups = decisions.filter((group) => group.decision === "REVIEW");
  const blockGroups = decisions.filter((group) => group.decision === "BLOCK");
  const reviewProjection = canonicalize({
    version: SOURCE_IDENTITY_AUTHORIZATION_VERSION,
    reviewGroups: reviewGroups.map((group) => group.authorizationProjection),
  });

  return {
    version: SOURCE_IDENTITY_AUTHORIZATION_VERSION,
    diagnosticPlanHash: identityPlan?.planHash ?? null,
    autoGroups,
    reviewGroups,
    blockGroups,
    reviewProjection,
    identityReviewPlanHash: hashProjection(reviewProjection),
    summary: summarizeDecisionGroups(decisions),
  };
}

export function normalizeExpectedIdentityReviewHash(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  if (!HASH_PATTERN.test(normalized)) {
    throw new SourceIdentityAuthorizationError({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.malformedReviewHash,
      message: "Identity review hash must be 64 lowercase hexadecimal characters.",
    });
  }
  return normalized;
}

export function compactSourceIdentityAuthorization(plan) {
  if (!plan) return null;
  const compact = (groups) =>
    groups.map((group) => ({
      baseSlug: group.baseSlug,
      reasonCodes: group.reasonCodes,
    }));
  return {
    version: plan.version,
    diagnosticPlanHash: plan.diagnosticPlanHash,
    identityReviewPlanHash: plan.identityReviewPlanHash,
    counts: plan.summary.counts,
    reasonCounts: plan.summary.reasonCounts,
    reviewGroups: compact(plan.reviewGroups),
    blockGroups: compact(plan.blockGroups),
  };
}

export class SourceIdentityAuthorizationError extends Error {
  constructor({ code, message, authorizationPlan = null }) {
    super(message);
    this.name = "SourceIdentityAuthorizationError";
    this.code = code;
    this.authorization = compactSourceIdentityAuthorization(authorizationPlan);
    this.catalogMayHaveCommitted = false;
  }
}

export function isSourceIdentityAuthorizationError(error) {
  return error instanceof SourceIdentityAuthorizationError;
}

export function assertSourceIdentityAuthorization({
  authorizationPlan,
  expectedIdentityReviewHash = null,
  expectedDiagnosticPlanHash = null,
}) {
  const expectedReviewHash = normalizeExpectedIdentityReviewHash(
    expectedIdentityReviewHash,
  );

  if (authorizationPlan.blockGroups.length > 0) {
    throw new SourceIdentityAuthorizationError({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.blocked,
      message: "Source identity authorization is blocked.",
      authorizationPlan,
    });
  }
  if (authorizationPlan.reviewGroups.length > 0 && !expectedReviewHash) {
    throw new SourceIdentityAuthorizationError({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.reviewRequired,
      message: "Source identity changes require an identity review hash.",
      authorizationPlan,
    });
  }
  if (
    authorizationPlan.reviewGroups.length > 0 &&
    expectedReviewHash !== authorizationPlan.identityReviewPlanHash
  ) {
    throw new SourceIdentityAuthorizationError({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.reviewHashMismatch,
      message: "Source identity review hash changed.",
      authorizationPlan,
    });
  }
  if (authorizationPlan.reviewGroups.length === 0 && expectedReviewHash) {
    throw new SourceIdentityAuthorizationError({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.staleReviewHash,
      message: "Identity review hash is stale because the review set is empty.",
      authorizationPlan,
    });
  }
  if (
    expectedDiagnosticPlanHash &&
    authorizationPlan.diagnosticPlanHash !== expectedDiagnosticPlanHash
  ) {
    throw new SourceIdentityAuthorizationError({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.diagnosticHashMismatch,
      message: "Source identity diagnostic plan hash changed.",
      authorizationPlan,
    });
  }
  return authorizationPlan;
}
