import { describe, expect, it } from "vitest";
import { analyzeCatalog } from "../audit-model-families.mjs";
import { buildBackfillLogicalPlan } from "./model-family-backfill.mjs";
import {
  assertModelFamilyMutationCounts,
  assertModelFamilyMutationPlanFingerprint,
  buildModelFamilyMutationProjection,
  buildModelFamilyReconciliationPlan,
  getModelFamilyMutationPlanFingerprint,
  hasReconciliationMutations,
} from "./model-family-reconciliation.mjs";

const outerspaceSnapshot = {
  products: 2,
  activeProducts: 2,
  productSizes: 2,
  maxUpdatedAt: "2026-08-14T00:00:00.000Z",
  productChecksum: "outerspace-products",
  productSizeChecksum: "outerspace-sizes",
};

function outerspaceProduct(overrides = {}) {
  return {
    id: "5dd7cd10-b971-4646-8d13-29f26109a590",
    slug: "capita-outerspace-living",
    brand: "Capita",
    modelName: "Outerspace Living",
    seasonLabel: "2025/2026",
    descriptionShort: "Outerspace base",
    descriptionFull: "Outerspace base description",
    ridingStyle: "all-mountain",
    skillLevel: "intermediate",
    flex: 6,
    boardLine: "men",
    shapeType: "directional-twin",
    camberProfile: "hybrid-camber",
    sourceName: "Official CAPiTA Outerspace Living 2026",
    sourceUrl: "https://capitasnowboarding.com/outerspace-living/",
    sourceCheckedAt: "2026-08-14",
    dataStatus: "verified",
    affiliateUrl:
      "https://www.traektoria.ru/product/1837462_snoubord-capita-outerspace-living/",
    isActive: true,
    familyId: null,
    familyManualOverride: false,
    familyMatchMethod: null,
    sizes: [
      {
        sizeCm: 156,
        sizeLabel: "156",
        waistWidthMm: 252,
        recommendedWeightMin: 65,
        recommendedWeightMax: 80,
        widthType: "regular",
        isAvailable: true,
      },
    ],
    ...overrides,
  };
}

function outerspaceProducts(overrides = {}) {
  return [
    outerspaceProduct(overrides.base),
    outerspaceProduct({
      id: "0c108449-3d3f-4e55-b6ae-ccaaf0833fe8",
      slug: "capita-outerspace-living-wide",
      modelName: "Outerspace Living Wide",
      descriptionShort: "Outerspace Wide",
      descriptionFull: "Outerspace Wide description",
      affiliateUrl:
        "https://www.traektoria.ru/product/1837463_snoubord-capita-outerspace-living-wide/",
      sizes: [
        {
          sizeCm: 157,
          sizeLabel: "157W",
          waistWidthMm: 264,
          recommendedWeightMin: 70,
          recommendedWeightMax: 85,
          widthType: "wide",
          isAvailable: true,
        },
      ],
      ...overrides.wide,
    }),
  ];
}

function analyzeOuterspace(products) {
  return analyzeCatalog(products, {
    before: outerspaceSnapshot,
    after: outerspaceSnapshot,
  });
}

function buildOuterspaceBackfill(analysis, products) {
  return buildBackfillLogicalPlan({
    analysis,
    products,
    baselineRepositorySha: "test-baseline",
    snapshot: outerspaceSnapshot,
  });
}

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
  it("reconciles production-shaped Outerspace Base and Wide from the same season", () => {
    const products = outerspaceProducts();
    const analysis = analyzeOuterspace(products);

    expect(analysis.highConfidenceWidthFamilies).toHaveLength(1);
    expect(analysis.highConfidenceWidthFamilies[0]).toMatchObject({
      classification: "HIGH_CONFIDENCE_WIDTH_FAMILY",
      canonicalCandidateModelName: "outerspace living",
      normalizedSeason: "2025/2026",
    });

    const backfill = buildOuterspaceBackfill(analysis, products);
    expect(backfill.families).toHaveLength(1);
    expect(backfill.families[0].identityKey).toBe(
      "v1|capita|outerspace living|2025/2026",
    );
    expect(backfill.families[0].memberProposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: "5dd7cd10-b971-4646-8d13-29f26109a590",
          role: "base",
        }),
        expect.objectContaining({
          productId: "0c108449-3d3f-4e55-b6ae-ccaaf0833fe8",
          role: "wide",
        }),
      ]),
    );

    const result = buildModelFamilyReconciliationPlan({
      candidateFamilies: backfill.families,
      existingFamilies: [],
      products,
      reviewFamilies: analysis.reviewWidthFamilies,
      keepSeparateFamilies: analysis.keepSeparate,
    });

    expect(result.newFamilies).toHaveLength(1);
    expect(result.newMemberships).toHaveLength(2);
    expect(result.newMemberships.map(({ role }) => role).sort()).toEqual([
      "base",
      "wide",
    ]);
    expect(result.blockingConflicts).toHaveLength(0);
  });

  it("keeps production-shaped Outerspace Base and Wide from different seasons separate", () => {
    const products = outerspaceProducts({
      base: { seasonLabel: "2024/2025" },
      wide: { seasonLabel: "2025/2026" },
    });
    const analysis = analyzeOuterspace(products);

    expect(analysis.highConfidenceWidthFamilies).toHaveLength(0);
    expect(analysis.keepSeparate).toHaveLength(1);
    expect(analysis.keepSeparate[0]).toMatchObject({
      classification: "KEEP_SEPARATE",
      normalizedSeason: null,
    });
    expect(analysis.keepSeparate[0].reasons).toContain(
      "Both seasons are known and different.",
    );

    const backfill = buildOuterspaceBackfill(analysis, products);
    expect(backfill.families).toHaveLength(0);

    const result = buildModelFamilyReconciliationPlan({
      candidateFamilies: backfill.families,
      existingFamilies: [],
      products,
      reviewFamilies: analysis.reviewWidthFamilies,
      keepSeparateFamilies: analysis.keepSeparate,
    });

    expect(result.newFamilies).toHaveLength(0);
    expect(result.newMemberships).toHaveLength(0);
    expect(hasReconciliationMutations(result)).toBe(false);
  });

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

  it("fingerprints the canonical mutation projection independently of object-key ordering", () => {
    const result = plan({ existingFamilies: [], products: [product("1"), product("2")] });
    const reordered = Object.fromEntries(Object.entries(result).reverse());
    reordered.newFamilies = result.newFamilies.map((item) =>
      Object.fromEntries(Object.entries(item).reverse()),
    );
    reordered.newMemberships = result.newMemberships.map((item) =>
      Object.fromEntries(Object.entries(item).reverse()),
    );
    expect(getModelFamilyMutationPlanFingerprint(reordered)).toBe(
      getModelFamilyMutationPlanFingerprint(result),
    );
  });

  it("excludes report and logging metadata from the mutation fingerprint", () => {
    const result = plan({ existingFamilies: [], products: [product("1"), product("2")] });
    const decorated = {
      ...result,
      generatedAt: "2099-01-01T00:00:00.000Z",
      reportPath: "C:/temporary/report.json",
      logging: { requestId: "diagnostic-only" },
    };
    expect(buildModelFamilyMutationProjection(decorated)).toEqual(
      buildModelFamilyMutationProjection(result),
    );
    expect(getModelFamilyMutationPlanFingerprint(decorated)).toBe(
      getModelFamilyMutationPlanFingerprint(result),
    );
  });

  it("changes the fingerprint for every mutation-relevant family or membership field", () => {
    const result = plan({ existingFamilies: [], products: [product("1"), product("2")] });
    const baseline = getModelFamilyMutationPlanFingerprint(result);
    const changes = [
      (copy) => { copy.newFamilies[0].identityKey = "changed-identity"; },
      (copy) => { copy.newFamilies[0].canonicalFamily.flex = 9; },
      (copy) => { copy.newFamilies[0].memberProposals[0].productId = "changed-product"; },
      (copy) => { copy.newFamilies[0].memberProposals[0].productSlug = "changed-slug"; },
      (copy) => { copy.newFamilies[0].memberProposals[0].role = "wide"; },
      (copy) => { copy.newMemberships[0].matchMethod = "manual"; },
      (copy) => { copy.newMemberships[0].confidence = "medium"; },
      (copy) => { copy.newMemberships[0].manualOverride = true; },
    ];
    for (const mutate of changes) {
      const copy = structuredClone(result);
      mutate(copy);
      expect(getModelFamilyMutationPlanFingerprint(copy)).not.toBe(baseline);
    }
  });

  it("changes the fingerprint when a canonical metadata update changes", () => {
    const existing = family();
    existing.canonicalFamily.descriptionShort = "Old copy";
    const result = plan({ existingFamilies: [existing] });
    const baseline = getModelFamilyMutationPlanFingerprint(result);
    const copy = structuredClone(result);
    copy.canonicalMetadataUpdates[0].changes.descriptionShort = "Different copy";
    expect(getModelFamilyMutationPlanFingerprint(copy)).not.toBe(baseline);
  });

  it("fails closed on a mismatched expected fingerprint", () => {
    const result = plan({ existingFamilies: [], products: [product("1"), product("2")] });
    const fingerprint = getModelFamilyMutationPlanFingerprint(result);
    expect(assertModelFamilyMutationPlanFingerprint(result, fingerprint)).toBe(fingerprint);
    expect(() => assertModelFamilyMutationPlanFingerprint(result, "0".repeat(64))).toThrow(
      "Model-family plan fingerprint mismatch",
    );
  });

  it("fails closed when actual mutation counts differ from the validated plan", () => {
    const result = plan({ existingFamilies: [], products: [product("1"), product("2")] });
    expect(
      assertModelFamilyMutationCounts(result, {
        insertedFamilies: 1,
        assignedProducts: 2,
        updatedFamilies: 0,
      }),
    ).toEqual({ insertedFamilies: 1, assignedProducts: 2, updatedFamilies: 0 });
    expect(() =>
      assertModelFamilyMutationCounts(result, {
        insertedFamilies: 1,
        assignedProducts: 1,
        updatedFamilies: 0,
      }),
    ).toThrow("Model-family mutation count mismatch");
  });
});
