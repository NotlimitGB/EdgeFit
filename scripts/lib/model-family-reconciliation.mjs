import {
  AUDIT_RULE,
  CANONICAL_SOURCE_KIND,
  MATCH_CONFIDENCE,
  MATCH_REASON,
  canonicalStringify,
  hashCanonicalValue,
} from "./model-family-backfill.mjs";
import {
  normalizeBrand,
  normalizeModelName,
  normalizeSeason,
} from "../audit-model-families.mjs";

export const RECONCILIATION_VERSION = "model-family-reconciliation-v1";
export const RECONCILIATION_LOCK_KEY = "edgefit:model-family-reconciliation:v1";
export const BACKFILL_LOCK_KEY = "edgefit:model-family-backfill:v1";

const CANONICAL_METADATA_FIELDS = [
  "descriptionShort",
  "descriptionFull",
  "ridingStyle",
  "skillLevel",
  "flex",
  "boardLine",
  "shapeType",
  "camberProfile",
  "canonicalSourceName",
  "canonicalSourceUrl",
  "canonicalSourceCheckedAt",
  "canonicalDataStatus",
];

function text(value) {
  return String(value ?? "").trim();
}

function compare(left, right) {
  return text(left).localeCompare(text(right), "en");
}

function sorted(values, key = (value) => value.identityKey ?? value.id ?? "") {
  return [...values].sort((left, right) => compare(key(left), key(right)));
}

function conflict(code, family, detail) {
  return {
    code,
    familyId: family?.id ?? null,
    identityKey: family?.identityKey ?? null,
    detail,
  };
}

function memberShape(member) {
  return {
    productId: text(member.productId),
    role: member.role,
  };
}

function expectedMembers(candidate) {
  return sorted(
    candidate.memberProposals.map(memberShape),
    (member) => `${member.role}|${member.productId}`,
  );
}

function actualMembers(family) {
  return sorted(family.members.map(memberShape), (member) => `${member.role}|${member.productId}`);
}

function isManualMember(member) {
  return member.manualOverride === true || member.matchMethod === "manual";
}

function isAutomaticMember(member) {
  return (
    member.manualOverride !== true &&
    member.matchMethod === AUDIT_RULE &&
    member.confidence === MATCH_CONFIDENCE
  );
}

function structuralProblem(family) {
  if (family.members.length !== 2) return "family must contain exactly two members";
  if (family.members.some((member) => !isAutomaticMember(member))) {
    return "automatic family has non-automatic membership provenance";
  }
  const roles = family.members.map((member) => member.role).sort();
  if (canonicalStringify(roles) !== canonicalStringify(["base", "wide"])) {
    return "automatic family must contain one base and one wide member";
  }
  return null;
}

function identityMatches(family, candidate) {
  return (
    logicalIdentityMatches(family, candidate) &&
    family.slug === candidate.slug &&
    text(family.slug) !== ""
  );
}

function logicalIdentityMatches(family, candidate) {
  const familyBrand = normalizeBrand(family.brand);
  const candidateBrand = normalizeBrand(candidate.brand);
  const familyModel = normalizeModelName(family.modelName);
  const candidateModel = normalizeModelName(candidate.modelName);
  const familySeason = normalizeSeason(family.seasonLabel);
  const candidateSeason = normalizeSeason(candidate.seasonLabel);
  return (
    text(family.identityKey) !== "" &&
    family.identityKey === candidate.identityKey &&
    familyBrand !== "" &&
    familyBrand === candidateBrand &&
    familyModel !== "" &&
    familyModel === candidateModel &&
    familySeason !== null &&
    familySeason === candidateSeason
  );
}

function metadataUpdate(family, candidate) {
  if (family.canonicalFamily?.canonicalSourceKind !== CANONICAL_SOURCE_KIND) return null;
  const changes = {};
  for (const field of CANONICAL_METADATA_FIELDS) {
    const current = family.canonicalFamily?.[field] ?? null;
    const proposed = candidate.canonicalFamily?.[field] ?? null;
    if (canonicalStringify(current) !== canonicalStringify(proposed)) {
      changes[field] = proposed;
    }
  }
  return Object.keys(changes).length
    ? { familyId: family.id, identityKey: family.identityKey, changes }
    : null;
}

function memberByRole(members, role) {
  return members.find((member) => member.role === role) ?? null;
}

function continuityFailure(family, detail) {
  return conflict("AUTOMATIC_CONTINUITY_UNSAFE", family, detail);
}

function buildAutomaticContinuityUpdate({
  family,
  candidate,
  productById,
  existingFamilies,
}) {
  if (!logicalIdentityMatches(family, candidate)) {
    return {
      conflict: conflict(
        "IDENTITY_DRIFT",
        family,
        "inactive automatic family and current HIGH proposal do not share one normalized logical identity",
      ),
    };
  }

  const currentBase = memberByRole(family.members, "base");
  const currentWide = memberByRole(family.members, "wide");
  const candidateBase = memberByRole(candidate.memberProposals ?? [], "base");
  const candidateWide = memberByRole(candidate.memberProposals ?? [], "wide");
  if (
    candidate.memberProposals?.length !== 2 ||
    !candidateBase ||
    !candidateWide
  ) {
    return {
      conflict: continuityFailure(
        family,
        "current HIGH proposal must contain exactly one base and one wide member",
      ),
    };
  }

  const oldBase = productById.get(text(currentBase.productId));
  const wide = productById.get(text(currentWide.productId));
  const newBase = productById.get(text(candidateBase.productId));
  const candidateWideProduct = productById.get(text(candidateWide.productId));
  if (!oldBase || !wide || !newBase || !candidateWideProduct) {
    return {
      conflict: continuityFailure(
        family,
        "automatic continuity references a Product missing from the catalog load",
      ),
    };
  }
  if (oldBase.isActive !== false) {
    return {
      conflict: continuityFailure(family, "the replaced automatic base is not inactive"),
    };
  }
  if (
    text(candidateWide.productId) !== text(currentWide.productId) ||
    text(candidateWide.productId) !== text(candidateWideProduct.id) ||
    wide.isActive !== true ||
    text(wide.familyId) !== text(family.id) ||
    wide.familyMemberRole !== "wide" ||
    wide.familyMatchMethod !== AUDIT_RULE ||
    wide.familyMatchConfidence !== MATCH_CONFIDENCE ||
    wide.familyManualOverride === true
  ) {
    return {
      conflict: continuityFailure(
        family,
        "the active automatic wide member is not preserved exactly",
      ),
    };
  }
  if (
    text(oldBase.id) === text(newBase.id) ||
    text(oldBase.familyId) !== text(family.id) ||
    oldBase.familyMemberRole !== "base" ||
    oldBase.familyMatchMethod !== AUDIT_RULE ||
    oldBase.familyMatchConfidence !== MATCH_CONFIDENCE ||
    oldBase.familyManualOverride === true
  ) {
    return {
      conflict: continuityFailure(
        family,
        "the inactive old base is not the sole replaceable automatic member",
      ),
    };
  }
  if (
    newBase.isActive !== true ||
    text(newBase.familyId) !== "" ||
    newBase.familyManualOverride === true ||
    newBase.familyMatchMethod === "manual"
  ) {
    return {
      conflict: continuityFailure(
        family,
        "the replacement base must be active, unassigned, and non-manual",
      ),
    };
  }

  const newFamilySlug = text(candidate.slug);
  if (!newFamilySlug) {
    return {
      conflict: continuityFailure(family, "the replacement family slug is empty"),
    };
  }
  const slugOwner = existingFamilies.find(
    (other) => other.id !== family.id && other.slug === newFamilySlug,
  );
  if (slugOwner) {
    return {
      conflict: continuityFailure(
        family,
        `replacement family slug ${newFamilySlug} belongs to another ModelFamily`,
      ),
    };
  }

  const metadata = metadataUpdate(family, candidate);
  const canonicalSourceKind = family.canonicalFamily?.canonicalSourceKind ?? null;
  return {
    update: {
      familyId: family.id,
      identityKey: family.identityKey,
      oldFamilySlug: family.slug,
      newFamilySlug,
      canonicalSourceKind,
      oldBaseProductId: text(currentBase.productId),
      oldBaseProductSlug: currentBase.productSlug,
      newBaseProductId: text(candidateBase.productId),
      newBaseProductSlug: candidateBase.productSlug,
      wideProductId: text(currentWide.productId),
      wideProductSlug: currentWide.productSlug,
      matchMethod: AUDIT_RULE,
      confidence: MATCH_CONFIDENCE,
      manualOverride: false,
      reason: "Automatic family continuity: inactive base replaced by the current same-identity HIGH base while preserving the Wide member.",
      canonicalMetadataChanges: metadata?.changes ?? {},
      canonicalMetadataTarget:
        canonicalSourceKind === CANONICAL_SOURCE_KIND
          ? { ...candidate.canonicalFamily }
          : null,
    },
  };
}

function informationalFamilies(values, classification) {
  return sorted(values ?? [], (value) =>
    [value.brand, value.canonicalCandidateModelName, value.normalizedSeason, value.id]
      .map(text)
      .join("|"),
  ).map((value) => ({
    id: value.id ?? null,
    brand: value.brand ?? null,
    modelName: value.canonicalCandidateModelName ?? null,
    season: value.normalizedSeason ?? null,
    classification,
  }));
}

export function buildModelFamilyReconciliationPlan({
  candidateFamilies,
  existingFamilies,
  products,
  reviewFamilies = [],
  keepSeparateFamilies = [],
}) {
  const productById = new Map(products.map((product) => [text(product.id), product]));
  const candidateByIdentity = new Map(
    candidateFamilies.map((family) => [family.identityKey, family]),
  );
  const candidateByProduct = new Map();
  const blockingConflicts = [];

  for (const candidate of candidateFamilies) {
    for (const member of candidate.memberProposals) {
      const productId = text(member.productId);
      if (candidateByProduct.has(productId)) {
        blockingConflicts.push(
          conflict("DUPLICATE_HIGH_MEMBERSHIP", null, `Product ${productId} appears in multiple HIGH candidates.`),
        );
      } else {
        candidateByProduct.set(productId, candidate);
      }
    }
  }

  const compatibleExisting = [];
  const historicalRetained = [];
  const manualManaged = [];
  const manualBlockedCandidates = [];
  const newFamilies = [];
  const newMemberships = [];
  const canonicalMetadataUpdates = [];
  const automaticContinuityUpdates = [];
  const handledCandidates = new Set();

  for (const family of sorted(existingFamilies)) {
    const members = family.members ?? [];
    const candidate = candidateByIdentity.get(family.identityKey);
    const memberCandidates = members
      .map((member) => candidateByProduct.get(text(member.productId)))
      .filter(Boolean);
    for (const candidate of memberCandidates) handledCandidates.add(candidate.identityKey);
    if (candidate) handledCandidates.add(candidate.identityKey);
    const manual = members.some(isManualMember);
    if (manual) {
      manualManaged.push({ familyId: family.id, identityKey: family.identityKey, reason: "manual membership is authoritative" });
      continue;
    }

    const problem = structuralProblem({ ...family, members });
    if (problem) {
      blockingConflicts.push(conflict("AUTOMATIC_STRUCTURE_DRIFT", family, problem));
      continue;
    }

    const missingProduct = members.find((member) => !productById.has(text(member.productId)));
    if (missingProduct) {
      blockingConflicts.push(
        conflict("MISSING_MEMBER", family, `Product ${missingProduct.productId} is missing from the catalog load.`),
      );
      continue;
    }

    if (members.some((member) => productById.get(text(member.productId))?.isActive === false)) {
      if (candidate) {
        const continuity = buildAutomaticContinuityUpdate({
          family: { ...family, members },
          candidate,
          productById,
          existingFamilies,
        });
        if (continuity.update) {
          automaticContinuityUpdates.push(continuity.update);
        } else {
          blockingConflicts.push(continuity.conflict);
        }
        continue;
      }
      if (memberCandidates.length > 0) {
        blockingConflicts.push(
          conflict(
            "IDENTITY_DRIFT",
            family,
            "an inactive automatic family member is claimed by a different current HIGH identity",
          ),
        );
        continue;
      }
      historicalRetained.push({
        familyId: family.id,
        identityKey: family.identityKey,
        inactiveProductIds: members
          .filter((member) => productById.get(text(member.productId))?.isActive === false)
          .map((member) => text(member.productId))
          .sort(compare),
      });
      continue;
    }

    if (!candidate) {
      blockingConflicts.push(conflict("ACTIVE_FAMILY_NOT_HIGH", family, "active automatic family is absent from current HIGH analysis"));
      continue;
    }
    if (!identityMatches(family, candidate)) {
      blockingConflicts.push(conflict("IDENTITY_DRIFT", family, "family slug or identity display fields differ from the current HIGH proposal"));
      continue;
    }
    if (canonicalStringify(actualMembers(family)) !== canonicalStringify(expectedMembers(candidate))) {
      blockingConflicts.push(conflict("MEMBERSHIP_DRIFT", family, "active member IDs or roles differ from the current HIGH proposal"));
      continue;
    }
    compatibleExisting.push({ familyId: family.id, identityKey: family.identityKey });
    const update = metadataUpdate(family, candidate);
    if (update) canonicalMetadataUpdates.push(update);
  }

  for (const candidate of sorted(candidateFamilies)) {
    if (handledCandidates.has(candidate.identityKey)) continue;
    const candidateProducts = candidate.memberProposals.map((member) => productById.get(text(member.productId)));
    if (candidateProducts.some((product) => !product)) {
      blockingConflicts.push(conflict("MISSING_CANDIDATE_PRODUCT", null, `HIGH candidate ${candidate.identityKey} references a missing Product.`));
      continue;
    }
    if (candidateProducts.some((product) => product.familyManualOverride === true && !product.familyId)) {
      manualBlockedCandidates.push({ identityKey: candidate.identityKey, reason: "an unassigned Product has a manual block" });
      continue;
    }
    if (candidateProducts.some((product) => product.familyManualOverride === true || product.familyMatchMethod === "manual")) {
      manualManaged.push({ familyId: null, identityKey: candidate.identityKey, reason: "candidate includes a manual assignment" });
      continue;
    }
    if (candidateProducts.some((product) => product.familyId)) {
      blockingConflicts.push(conflict("CANDIDATE_ALREADY_ASSIGNED", null, `HIGH candidate ${candidate.identityKey} includes an assigned Product.`));
      continue;
    }
    const slugCollision = existingFamilies.find((family) => family.slug === candidate.slug);
    const identityCollision = existingFamilies.find(
      (family) => family.identityKey === candidate.identityKey,
    );
    if (slugCollision || identityCollision) {
      blockingConflicts.push(conflict("FAMILY_COLLISION", slugCollision ?? identityCollision, `HIGH candidate ${candidate.identityKey} collides with an existing family.`));
      continue;
    }
    newFamilies.push(candidate);
    for (const member of candidate.memberProposals) {
      newMemberships.push({
        identityKey: candidate.identityKey,
        productId: text(member.productId),
        productSlug: member.productSlug,
        role: member.role,
        matchMethod: AUDIT_RULE,
        confidence: MATCH_CONFIDENCE,
        manualOverride: false,
        reason: member.reason || MATCH_REASON,
      });
    }
  }

  return {
    version: RECONCILIATION_VERSION,
    compatibleExisting: sorted(compatibleExisting),
    historicalRetained: sorted(historicalRetained),
    manualManaged: sorted(manualManaged),
    manualBlockedCandidates: sorted(manualBlockedCandidates),
    newFamilies: sorted(newFamilies),
    newMemberships: sorted(newMemberships, (value) => `${value.identityKey}|${value.role}|${value.productId}`),
    canonicalMetadataUpdates: sorted(canonicalMetadataUpdates),
    automaticContinuityUpdates: sorted(automaticContinuityUpdates),
    reviewUntouched: informationalFamilies(reviewFamilies, "REVIEW_WIDTH_FAMILY"),
    keepSeparateUntouched: informationalFamilies(keepSeparateFamilies, "KEEP_SEPARATE"),
    blockingConflicts: sorted(blockingConflicts, (value) => `${value.identityKey}|${value.code}|${value.detail}`),
  };
}

export function hasReconciliationMutations(plan) {
  return (
    plan.newFamilies.length > 0 ||
    plan.newMemberships.length > 0 ||
    plan.canonicalMetadataUpdates.length > 0 ||
    (plan.automaticContinuityUpdates?.length ?? 0) > 0
  );
}

export function buildModelFamilyMutationProjection(plan) {
  return {
    newFamilies: plan.newFamilies.map((family) => ({
      identityKey: family.identityKey,
      slug: family.slug,
      brand: family.brand,
      modelName: family.modelName,
      seasonLabel: family.seasonLabel,
      canonicalFamily: family.canonicalFamily,
      memberProposals: family.memberProposals.map((member) => ({
        productId: member.productId,
        productSlug: member.productSlug,
        role: member.role,
      })),
    })),
    newMemberships: plan.newMemberships.map((member) => ({
      identityKey: member.identityKey,
      productId: member.productId,
      productSlug: member.productSlug,
      role: member.role,
      matchMethod: member.matchMethod,
      confidence: member.confidence,
      manualOverride: member.manualOverride,
    })),
    canonicalMetadataUpdates: plan.canonicalMetadataUpdates.map((update) => ({
      familyId: update.familyId,
      identityKey: update.identityKey,
      changes: update.changes,
    })),
    automaticContinuityUpdates: (plan.automaticContinuityUpdates ?? []).map(
      (update) => ({ ...update }),
    ),
  };
}

export function getModelFamilyMutationPlanFingerprint(plan) {
  return hashCanonicalValue(buildModelFamilyMutationProjection(plan));
}

export function assertModelFamilyMutationPlanFingerprint(plan, expectedFingerprint) {
  const actualFingerprint = getModelFamilyMutationPlanFingerprint(plan);
  if (actualFingerprint !== expectedFingerprint) {
    throw new Error(
      `Model-family plan fingerprint mismatch: expected ${expectedFingerprint}, got ${actualFingerprint}.`,
    );
  }
  return actualFingerprint;
}

export function assertModelFamilyMutationCounts(plan, mutation) {
  const expected = {
    insertedFamilies: plan.newFamilies.length,
    assignedProducts: plan.newMemberships.length,
    updatedFamilies: plan.canonicalMetadataUpdates.length,
    reconciledFamilies: plan.automaticContinuityUpdates?.length ?? 0,
  };
  if (canonicalStringify(mutation) !== canonicalStringify(expected)) {
    throw new Error(
      `Model-family mutation count mismatch: expected ${canonicalStringify(expected)}, got ${canonicalStringify(mutation)}.`,
    );
  }
  return expected;
}
