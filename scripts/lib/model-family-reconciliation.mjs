import {
  AUDIT_RULE,
  CANONICAL_SOURCE_KIND,
  MATCH_CONFIDENCE,
  MATCH_REASON,
  canonicalStringify,
  hashCanonicalValue,
} from "./model-family-backfill.mjs";

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
    family.identityKey === candidate.identityKey &&
    family.slug === candidate.slug &&
    family.brand === candidate.brand &&
    family.modelName === candidate.modelName &&
    family.seasonLabel === candidate.seasonLabel
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
  const handledCandidates = new Set();

  for (const family of sorted(existingFamilies)) {
    const members = family.members ?? [];
    const memberCandidates = members
      .map((member) => candidateByProduct.get(text(member.productId)))
      .filter(Boolean);
    for (const candidate of memberCandidates) handledCandidates.add(candidate.identityKey);
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

    const candidate = candidateByIdentity.get(family.identityKey);
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
    reviewUntouched: informationalFamilies(reviewFamilies, "REVIEW_WIDTH_FAMILY"),
    keepSeparateUntouched: informationalFamilies(keepSeparateFamilies, "KEEP_SEPARATE"),
    blockingConflicts: sorted(blockingConflicts, (value) => `${value.identityKey}|${value.code}|${value.detail}`),
  };
}

export function hasReconciliationMutations(plan) {
  return (
    plan.newFamilies.length > 0 ||
    plan.newMemberships.length > 0 ||
    plan.canonicalMetadataUpdates.length > 0
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
  };
  if (canonicalStringify(mutation) !== canonicalStringify(expected)) {
    throw new Error(
      `Model-family mutation count mismatch: expected ${canonicalStringify(expected)}, got ${canonicalStringify(mutation)}.`,
    );
  }
  return expected;
}
