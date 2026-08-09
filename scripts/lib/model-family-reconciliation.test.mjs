import { describe, expect, it } from "vitest";
import {
  buildModelFamilyReconciliationPlan,
  hasReconciliationMutations,
} from "./model-family-reconciliation.mjs";

function product(id, overrides = {}) {
  return {
    id,
    slug: `board-${id}`,
    isActive: true,
    familyId: null,
    familyManualOverride: false,
    familyMatchMethod: null,
    ...overrides,
  };
}

function candidate(key = "v1|brand|model|2025/2026", overrides = {}) {
  return {
    identityKey: key,
    slug: "brand-model",
    brand: "Brand",
    modelName: "Model",
    seasonLabel: "2025/2026",
    canonicalFamily: {
      descriptionShort: "Base copy",
      descriptionFull: null,
      ridingStyle: "all-mountain",
      skillLevel: "intermediate",
      flex: 6,
      boardLine: "men",
      shapeType: "directional-twin",
      camberProfile: "hybrid-camber",
      canonicalSourceKind: "fallback-member",
      canonicalSourceName: "Source",
      canonicalSourceUrl: "https://example.com",
      canonicalSourceCheckedAt: "2026-08-09",
      canonicalDataStatus: "verified",
    },
    memberProposals: [
      { productId: "1", productSlug: "brand-model", role: "base", reason: "HIGH" },
      { productId: "2", productSlug: "brand-model-wide", role: "wide", reason: "HIGH" },
    ],
    ...overrides,
  };
}

function family(sourceKind = "fallback-member", overrides = {}) {
  const proposed = candidate();
  return {
    id: "family-1",
    identityKey: proposed.identityKey,
    slug: proposed.slug,
    brand: proposed.brand,
    modelName: proposed.modelName,
    seasonLabel: proposed.seasonLabel,
    canonicalFamily: { ...proposed.canonicalFamily, canonicalSourceKind: sourceKind },
    members: proposed.memberProposals.map((member) => ({
      ...member,
      matchMethod: "audit-high-v1",
      confidence: "high",
      manualOverride: false,
      matchedAt: "2026-08-09T06:29:28.058Z",
    })),
    ...overrides,
  };
}

function plan(overrides = {}) {
  const existingFamilies = overrides.existingFamilies ?? [family()];
  const products =
    overrides.products ??
    [
      product("1", { familyId: existingFamilies[0]?.id ?? null }),
      product("2", { familyId: existingFamilies[0]?.id ?? null }),
    ];
  return buildModelFamilyReconciliationPlan({
    candidateFamilies: overrides.candidateFamilies ?? [candidate()],
    existingFamilies,
    products,
    reviewFamilies: overrides.reviewFamilies,
    keepSeparateFamilies: overrides.keepSeparateFamilies,
  });
}

describe("model family refresh reconciliation", () => {
  it("classifies a compatible automatic family as a no-op", () => {
    const result = plan();
    expect(result.compatibleExisting).toHaveLength(1);
    expect(hasReconciliationMutations(result)).toBe(false);
  });

  it("proposes one family and two memberships for a new HIGH pair", () => {
    const result = plan({ existingFamilies: [], products: [product("1"), product("2")] });
    expect(result.newFamilies).toHaveLength(1);
    expect(result.newMemberships.map((item) => item.role).sort()).toEqual(["base", "wide"]);
  });

  it("honors a manual block for the whole candidate", () => {
    const result = plan({
      existingFamilies: [],
      products: [product("1", { familyManualOverride: true }), product("2")],
    });
    expect(result.manualBlockedCandidates).toHaveLength(1);
    expect(hasReconciliationMutations(result)).toBe(false);
  });

  it("honors a manual assignment", () => {
    const manual = family("manual", {
      members: family().members.map((member) => ({ ...member, matchMethod: "manual" })),
    });
    const result = plan({ existingFamilies: [manual] });
    expect(result.manualManaged).toHaveLength(1);
    expect(result.blockingConflicts).toHaveLength(0);
  });

  it("blocks active identity drift", () => {
    const result = plan({ existingFamilies: [family("fallback-member", { slug: "changed" })] });
    expect(result.blockingConflicts[0].code).toBe("IDENTITY_DRIFT");
  });

  it("retains a family when one member becomes inactive", () => {
    const result = plan({ products: [product("1", { familyId: "family-1" }), product("2", { familyId: "family-1", isActive: false })] });
    expect(result.historicalRetained[0].inactiveProductIds).toEqual(["2"]);
  });

  it("retains a family when both members become inactive", () => {
    const result = plan({ products: [product("1", { familyId: "family-1", isActive: false }), product("2", { familyId: "family-1", isActive: false })] });
    expect(result.historicalRetained[0].inactiveProductIds).toEqual(["1", "2"]);
  });

  it("blocks an automatic family with a missing Product member", () => {
    const result = plan({ products: [product("1", { familyId: "family-1" })] });
    expect(result.blockingConflicts[0].code).toBe("MISSING_MEMBER");
  });

  it("blocks an automatic family with wrong roles", () => {
    const bad = family();
    bad.members[0].role = "wide";
    expect(plan({ existingFamilies: [bad] }).blockingConflicts[0].code).toBe("AUTOMATIC_STRUCTURE_DRIFT");
  });

  it("blocks a partially assigned new candidate", () => {
    const result = plan({
      existingFamilies: [],
      products: [product("1", { familyId: "orphan-family" }), product("2")],
    });
    expect(result.blockingConflicts[0].code).toBe("CANDIDATE_ALREADY_ASSIGNED");
  });

  it("keeps REVIEW families informational", () => {
    const result = plan({ reviewFamilies: [{ id: "review", brand: "B" }] });
    expect(result.reviewUntouched).toEqual([expect.objectContaining({ classification: "REVIEW_WIDTH_FAMILY" })]);
  });

  it("keeps KEEP_SEPARATE families informational", () => {
    const result = plan({ keepSeparateFamilies: [{ id: "keep", brand: "B" }] });
    expect(result.keepSeparateUntouched).toEqual([expect.objectContaining({ classification: "KEEP_SEPARATE" })]);
  });

  it("refreshes changed fallback-member canonical metadata", () => {
    const existing = family();
    existing.canonicalFamily.descriptionShort = "Old copy";
    const result = plan({ existingFamilies: [existing] });
    expect(result.canonicalMetadataUpdates[0].changes).toEqual({ descriptionShort: "Base copy" });
  });

  it("protects every stronger canonical source kind", () => {
    for (const sourceKind of ["verified-official", "manual", "trusted-member"]) {
      const existing = family(sourceKind);
      existing.canonicalFamily.descriptionShort = "Curated";
      expect(plan({ existingFamilies: [existing] }).canonicalMetadataUpdates).toHaveLength(0);
    }
  });

  it("never turns immutable identity drift into a metadata update", () => {
    const existing = family("fallback-member", { modelName: "Renamed" });
    const result = plan({ existingFamilies: [existing] });
    expect(result.blockingConflicts[0].code).toBe("IDENTITY_DRIFT");
    expect(result.canonicalMetadataUpdates).toHaveLength(0);
  });

  it("orders actions deterministically", () => {
    const second = candidate("v1|z|model|2025/2026", {
      slug: "z-model",
      brand: "Z",
      memberProposals: [
        { productId: "3", productSlug: "z-model", role: "base", reason: "HIGH" },
        { productId: "4", productSlug: "z-model-wide", role: "wide", reason: "HIGH" },
      ],
    });
    const products = [product("4"), product("2"), product("3"), product("1")];
    const first = plan({ existingFamilies: [], products, candidateFamilies: [second, candidate()] });
    const reversed = plan({ existingFamilies: [], products: [...products].reverse(), candidateFamilies: [candidate(), second] });
    expect(first).toEqual(reversed);
  });

  it("is idempotent after applying its proposed state", () => {
    const initial = plan({ existingFamilies: [], products: [product("1"), product("2")] });
    expect(hasReconciliationMutations(initial)).toBe(true);
    const applied = family();
    expect(plan({ existingFamilies: [applied] }).newFamilies).toHaveLength(0);
    expect(hasReconciliationMutations(plan({ existingFamilies: [applied] }))).toBe(false);
  });
});
