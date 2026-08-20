import { describe, expect, it } from "vitest";
import { analyzeCatalog } from "../audit-model-families.mjs";
import {
  buildBackfillLogicalPlan,
  hashCanonicalValue,
} from "./model-family-backfill.mjs";
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

const NITRO_FAMILY_ID = "8f54836c-03c4-450f-8c67-09cd877c1e0a";
const NITRO_OLD_BASE_ID = "fa3cd51a-9792-4038-a9f8-687a8fe3d80a";
const NITRO_NEW_BASE_ID = "f1b4e304-21af-4c1d-b199-e2561054ef2a";
const NITRO_WIDE_ID = "9b3c601b-8749-449e-af19-e3958603109f";

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

function nitroProduct(overrides = {}) {
  return {
    id: NITRO_NEW_BASE_ID,
    slug: "nitro-team",
    brand: "Nitro",
    modelName: "Team",
    seasonLabel: "2025/2026",
    descriptionShort: "Canonical Team copy",
    descriptionFull: "Canonical Team description",
    ridingStyle: "all-mountain",
    skillLevel: "advanced",
    flex: 7,
    boardLine: "men",
    shapeType: "directional-twin",
    camberProfile: "camber",
    sourceName: "Official Nitro Team 2026",
    sourceUrl: "https://example.com/nitro-team",
    sourceCheckedAt: "2026-08-20",
    dataStatus: "verified",
    affiliateUrl: "https://example.com/store/nitro-team",
    isActive: true,
    familyId: null,
    familyMemberRole: null,
    familyMatchMethod: null,
    familyMatchConfidence: null,
    familyManualOverride: false,
    familyMatchReason: null,
    familyMatchedAt: null,
    sizes: [
      {
        sizeCm: 159,
        sizeLabel: "159",
        waistWidthMm: 256,
        widthType: "regular",
        isAvailable: true,
      },
    ],
    ...overrides,
  };
}

function nitroContinuityFixture() {
  const newBase = nitroProduct();
  const wide = nitroProduct({
    id: NITRO_WIDE_ID,
    slug: "nitro-team-wide",
    modelName: "Team Wide",
    descriptionShort: "Team Wide copy",
    sourceName: "Trial Sport",
    sourceUrl: "https://example.com/nitro-team-wide",
    affiliateUrl: "https://example.com/store/nitro-team-wide",
    familyId: NITRO_FAMILY_ID,
    familyMemberRole: "wide",
    familyMatchMethod: "audit-high-v1",
    familyMatchConfidence: "high",
    familyMatchReason: "HIGH",
    familyMatchedAt: "2026-08-14T00:00:00.000Z",
    sizes: [
      {
        sizeCm: 162,
        sizeLabel: "162W",
        waistWidthMm: 270,
        widthType: "wide",
        isAvailable: true,
      },
    ],
  });
  const oldBase = nitroProduct({
    id: NITRO_OLD_BASE_ID,
    slug: "nitro-team-2025-2026",
    modelName: "TEAM",
    descriptionShort: "Old family copy",
    sourceName: "Trial Sport",
    sourceUrl: "https://example.com/old-nitro-team",
    affiliateUrl: "https://example.com/store/old-nitro-team",
    isActive: false,
    familyId: NITRO_FAMILY_ID,
    familyMemberRole: "base",
    familyMatchMethod: "audit-high-v1",
    familyMatchConfidence: "high",
    familyMatchReason: "HIGH",
    familyMatchedAt: "2026-08-14T00:00:00.000Z",
  });
  const analysis = analyzeCatalog([newBase, wide], {
    before: outerspaceSnapshot,
    after: outerspaceSnapshot,
  });
  const candidateFamilies = buildBackfillLogicalPlan({
    analysis,
    products: [newBase, wide],
    baselineRepositorySha: "future-nitro",
    snapshot: outerspaceSnapshot,
  }).families;
  const existingFamily = {
    id: NITRO_FAMILY_ID,
    identityKey: "v1|nitro|team|2025/2026",
    slug: "nitro-team-2025-2026",
    brand: "Nitro",
    modelName: "TEAM",
    seasonLabel: "2025/2026",
    canonicalFamily: {
      ...candidateFamilies[0].canonicalFamily,
      descriptionShort: "Old family copy",
      canonicalSourceKind: "fallback-member",
    },
    members: [
      {
        productId: oldBase.id,
        productSlug: oldBase.slug,
        role: "base",
        matchMethod: "audit-high-v1",
        confidence: "high",
        manualOverride: false,
      },
      {
        productId: wide.id,
        productSlug: wide.slug,
        role: "wide",
        matchMethod: "audit-high-v1",
        confidence: "high",
        manualOverride: false,
      },
    ],
  };
  return {
    candidateFamilies,
    existingFamilies: [existingFamily],
    products: [oldBase, newBase, wide],
  };
}

function nitroPlan(fixture = nitroContinuityFixture()) {
  return buildModelFamilyReconciliationPlan({
    ...fixture,
    reviewFamilies: fixture.reviewFamilies,
    keepSeparateFamilies: fixture.keepSeparateFamilies,
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
    const result = plan({ candidateFamilies: [], products: [product("1", { familyId: "family-1" }), product("2", { familyId: "family-1", isActive: false })] });
    expect(result.historicalRetained[0].inactiveProductIds).toEqual(["2"]);
  });

  it("retains a family when both members become inactive", () => {
    const result = plan({ candidateFamilies: [], products: [product("1", { familyId: "family-1", isActive: false }), product("2", { familyId: "family-1", isActive: false })] });
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

  it("plans the exact future Nitro base continuity while preserving family and Wide identity", () => {
    const fixture = nitroContinuityFixture();
    const result = nitroPlan(fixture);

    expect(result.blockingConflicts).toHaveLength(0);
    expect(result.historicalRetained).toHaveLength(0);
    expect(result.automaticContinuityUpdates).toEqual([
      expect.objectContaining({
        familyId: NITRO_FAMILY_ID,
        identityKey: "v1|nitro|team|2025/2026",
        oldFamilySlug: "nitro-team-2025-2026",
        newFamilySlug: "nitro-team",
        oldBaseProductId: NITRO_OLD_BASE_ID,
        newBaseProductId: NITRO_NEW_BASE_ID,
        wideProductId: NITRO_WIDE_ID,
        canonicalSourceKind: "fallback-member",
        canonicalMetadataChanges: expect.objectContaining({
          descriptionShort: "Canonical Team copy",
        }),
        canonicalMetadataTarget: expect.objectContaining({
          canonicalSourceName: "Official Nitro Team 2026",
        }),
      }),
    ]);
    expect(hasReconciliationMutations(result)).toBe(true);

    const appliedProducts = structuredClone(fixture.products);
    const oldBase = appliedProducts.find(({ id }) => id === NITRO_OLD_BASE_ID);
    Object.assign(oldBase, {
      familyId: null,
      familyMemberRole: null,
      familyMatchMethod: null,
      familyMatchConfidence: null,
      familyMatchReason: null,
      familyMatchedAt: null,
    });
    const newBase = appliedProducts.find(({ id }) => id === NITRO_NEW_BASE_ID);
    Object.assign(newBase, {
      familyId: NITRO_FAMILY_ID,
      familyMemberRole: "base",
      familyMatchMethod: "audit-high-v1",
      familyMatchConfidence: "high",
      familyMatchReason: result.automaticContinuityUpdates[0].reason,
      familyMatchedAt: "2026-08-20T00:00:00.000Z",
    });
    const appliedFamily = structuredClone(fixture.existingFamilies[0]);
    appliedFamily.slug = "nitro-team";
    appliedFamily.canonicalFamily = {
      ...result.automaticContinuityUpdates[0].canonicalMetadataTarget,
    };
    appliedFamily.members = [
      {
        productId: NITRO_NEW_BASE_ID,
        productSlug: "nitro-team",
        role: "base",
        matchMethod: "audit-high-v1",
        confidence: "high",
        manualOverride: false,
      },
      fixture.existingFamilies[0].members.find(({ role }) => role === "wide"),
    ];
    const postState = nitroPlan({
      ...fixture,
      products: appliedProducts,
      existingFamilies: [appliedFamily],
    });
    expect(postState.compatibleExisting).toEqual([
      { familyId: NITRO_FAMILY_ID, identityKey: "v1|nitro|team|2025/2026" },
    ]);
    expect(postState.automaticContinuityUpdates).toHaveLength(0);
    expect(postState.blockingConflicts).toHaveLength(0);
    expect(hasReconciliationMutations(postState)).toBe(false);
  });

  it.each([
    ["active old base", (fixture) => { fixture.products[0].isActive = true; }],
    ["inactive new base", (fixture) => { fixture.products[1].isActive = false; }],
    ["assigned new base", (fixture) => { fixture.products[1].familyId = "other-family"; }],
    ["manual new base", (fixture) => { fixture.products[1].familyManualOverride = true; }],
    ["inactive Wide", (fixture) => { fixture.products[2].isActive = false; }],
    ["changed Wide", (fixture) => {
      fixture.candidateFamilies[0].memberProposals.find(({ role }) => role === "wide").productId = "other-wide";
      fixture.products.push(nitroProduct({ id: "other-wide", slug: "other-wide", modelName: "Team Wide" }));
    }],
    ["identity key drift", (fixture) => { fixture.candidateFamilies[0].identityKey = "v1|nitro|team|2024/2025"; }],
    ["brand drift", (fixture) => { fixture.candidateFamilies[0].brand = "Other"; }],
    ["model drift", (fixture) => { fixture.candidateFamilies[0].modelName = "Other"; }],
    ["season drift", (fixture) => { fixture.candidateFamilies[0].seasonLabel = "2024/2025"; }],
    ["both members change", (fixture) => {
      fixture.candidateFamilies[0].memberProposals.find(({ role }) => role === "wide").productId = "other-wide";
      fixture.products.push(nitroProduct({ id: "other-wide", slug: "other-wide", modelName: "Team Wide" }));
    }],
    ["empty candidate slug", (fixture) => { fixture.candidateFamilies[0].slug = ""; }],
    ["colliding candidate slug", (fixture) => {
      fixture.existingFamilies.push({
        ...family("manual"),
        id: "other-family",
        identityKey: "v1|other|model|2025/2026",
        slug: "nitro-team",
        members: family("manual").members.map((member) => ({
          ...member,
          matchMethod: "manual",
        })),
      });
    }],
  ])("fails closed for unsafe automatic continuity: %s", (_label, mutate) => {
    const fixture = nitroContinuityFixture();
    mutate(fixture);
    const result = nitroPlan(fixture);
    expect(result.automaticContinuityUpdates).toHaveLength(0);
    expect(result.blockingConflicts.length).toBeGreaterThan(0);
  });

  it("keeps manual existing membership authoritative instead of reconciling continuity", () => {
    for (const role of ["base", "wide"]) {
      const fixture = nitroContinuityFixture();
      const member = fixture.existingFamilies[0].members.find(
        (candidateMember) => candidateMember.role === role,
      );
      member.matchMethod = "manual";
      member.manualOverride = true;
      const result = nitroPlan(fixture);
      expect(result.automaticContinuityUpdates).toHaveLength(0);
      expect(result.manualManaged).toHaveLength(1);
    }
  });

  it("blocks continuity when the existing Wide Product is missing", () => {
    const fixture = nitroContinuityFixture();
    fixture.products = fixture.products.filter(({ id }) => id !== NITRO_WIDE_ID);
    const result = nitroPlan(fixture);
    expect(result.automaticContinuityUpdates).toHaveLength(0);
    expect(result.blockingConflicts[0].code).toBe("MISSING_MEMBER");
  });

  it("preserves stronger canonical metadata during an otherwise safe continuity update", () => {
    const fixture = nitroContinuityFixture();
    fixture.existingFamilies[0].canonicalFamily.canonicalSourceKind = "manual";
    fixture.existingFamilies[0].canonicalFamily.descriptionShort = "Curated";
    const result = nitroPlan(fixture);
    expect(result.blockingConflicts).toHaveLength(0);
    expect(result.automaticContinuityUpdates[0]).toMatchObject({
      canonicalSourceKind: "manual",
      canonicalMetadataChanges: {},
      canonicalMetadataTarget: null,
    });
  });

  it("keeps REVIEW and KEEP_SEPARATE candidates informational", () => {
    for (const classification of ["REVIEW_WIDTH_FAMILY", "KEEP_SEPARATE"]) {
      const fixture = nitroContinuityFixture();
      fixture.candidateFamilies = [];
      if (classification === "REVIEW_WIDTH_FAMILY") {
        fixture.reviewFamilies = [{ id: "nitro-review", brand: "Nitro" }];
      } else {
        fixture.keepSeparateFamilies = [{ id: "nitro-keep", brand: "Nitro" }];
      }
      const result = nitroPlan(fixture);
      expect(result.automaticContinuityUpdates).toHaveLength(0);
      expect(result.historicalRetained).toHaveLength(1);
      expect(result.blockingConflicts).toHaveLength(0);
    }
  });

  it("blocks continuity when the existing family is not exactly automatic base plus Wide", () => {
    const fixture = nitroContinuityFixture();
    fixture.existingFamilies[0].members[1].role = "base";
    const result = nitroPlan(fixture);
    expect(result.automaticContinuityUpdates).toHaveLength(0);
    expect(result.blockingConflicts[0].code).toBe("AUTOMATIC_STRUCTURE_DRIFT");
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

  it("fingerprints every continuity field and rejects a pre-continuity fingerprint", () => {
    const result = nitroPlan();
    const baseline = getModelFamilyMutationPlanFingerprint(result);
    const update = result.automaticContinuityUpdates[0];
    for (const field of [
      "familyId",
      "identityKey",
      "oldFamilySlug",
      "newFamilySlug",
      "oldBaseProductId",
      "oldBaseProductSlug",
      "newBaseProductId",
      "newBaseProductSlug",
      "wideProductId",
      "wideProductSlug",
      "matchMethod",
      "confidence",
      "reason",
    ]) {
      const copy = structuredClone(result);
      copy.automaticContinuityUpdates[0][field] = `${update[field]}-changed`;
      expect(getModelFamilyMutationPlanFingerprint(copy)).not.toBe(baseline);
    }
    for (const mutate of [
      (copy) => { copy.automaticContinuityUpdates[0].manualOverride = true; },
      (copy) => { copy.automaticContinuityUpdates[0].canonicalMetadataChanges.flex = 10; },
      (copy) => { copy.automaticContinuityUpdates[0].canonicalMetadataTarget.flex = 10; },
    ]) {
      const copy = structuredClone(result);
      mutate(copy);
      expect(getModelFamilyMutationPlanFingerprint(copy)).not.toBe(baseline);
    }

    const currentProjection = buildModelFamilyMutationProjection(result);
    const preContinuityFingerprint = hashCanonicalValue({
      newFamilies: currentProjection.newFamilies,
      newMemberships: currentProjection.newMemberships,
      canonicalMetadataUpdates: currentProjection.canonicalMetadataUpdates,
    });
    expect(preContinuityFingerprint).not.toBe(baseline);
    expect(() =>
      assertModelFamilyMutationPlanFingerprint(result, preContinuityFingerprint),
    ).toThrow("Model-family plan fingerprint mismatch");
    expect(
      assertModelFamilyMutationCounts(result, {
        insertedFamilies: 0,
        assignedProducts: 0,
        updatedFamilies: 0,
        reconciledFamilies: 1,
      }),
    ).toEqual({
      insertedFamilies: 0,
      assignedProducts: 0,
      updatedFamilies: 0,
      reconciledFamilies: 1,
    });
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
        reconciledFamilies: 0,
      }),
    ).toEqual({
      insertedFamilies: 1,
      assignedProducts: 2,
      updatedFamilies: 0,
      reconciledFamilies: 0,
    });
    expect(() =>
      assertModelFamilyMutationCounts(result, {
        insertedFamilies: 1,
        assignedProducts: 1,
        updatedFamilies: 0,
        reconciledFamilies: 0,
      }),
    ).toThrow("Model-family mutation count mismatch");
  });
});
