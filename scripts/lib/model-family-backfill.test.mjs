import { describe, expect, it } from "vitest";
import {
  buildBackfillLogicalPlan,
  buildPlanArtifact,
  compareExistingBackfillState,
} from "./model-family-backfill.mjs";

const snapshot = {
  products: 453,
  activeProducts: 405,
  productSizes: 1406,
  maxUpdatedAt: "2026-04-17 20:01:10.302949+00",
  productChecksum: "products-checksum",
  productSizeChecksum: "sizes-checksum",
};

function product(overrides = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "bataleon-beyond-medals",
    brand: "Bataleon",
    modelName: "Beyond Medals",
    seasonLabel: "2024/2025",
    descriptionShort: "Short",
    descriptionFull: "Full",
    ridingStyle: "all-mountain",
    skillLevel: "advanced",
    flex: 7,
    boardLine: "men",
    shapeType: "directional-twin",
    camberProfile: "hybrid-camber",
    sourceName: "Official source",
    sourceUrl: "https://example.com/base",
    sourceCheckedAt: "2026-04-17",
    dataStatus: "verified",
    sizes: [],
    ...overrides,
  };
}

function products() {
  return [
    product(),
    product({
      id: "00000000-0000-0000-0000-000000000002",
      slug: "bataleon-beyond-medals-wide",
      modelName: "Beyond Medals Wide",
      sourceUrl: "https://example.com/wide",
    }),
  ];
}

function highFamily(overrides = {}) {
  const catalogProducts = products();
  return {
    id: "width:bataleon:beyond-medals",
    classification: "HIGH_CONFIDENCE_WIDTH_FAMILY",
    brand: "Bataleon",
    canonicalCandidateModelName: "beyond medals",
    normalizedSeason: "2024/2025",
    members: catalogProducts.map((item) => ({
      id: item.id,
      slug: item.slug,
      brand: item.brand,
      modelName: item.modelName,
      seasonLabel: item.seasonLabel,
    })),
    ...overrides,
  };
}

function analysis(families = [highFamily()]) {
  return {
    summary: {
      highConfidenceWidthFamilyCount: families.length,
      reviewWidthFamilyCount: 0,
      keepSeparateCount: 0,
      exactOrCrossStoreDuplicateCount: 0,
    },
    highConfidenceWidthFamilies: families,
  };
}

function logicalPlan(options = {}) {
  return buildBackfillLogicalPlan({
    analysis: options.analysis ?? analysis(),
    products: options.products ?? products(),
    baselineRepositorySha: "baseline-sha",
    snapshot,
  });
}

function exactExistingFamily(plan) {
  const family = plan.families[0];
  return {
    id: "10000000-0000-0000-0000-000000000001",
    identityKey: family.identityKey,
    slug: family.slug,
    brand: family.brand,
    modelName: family.modelName,
    seasonLabel: family.seasonLabel,
    canonicalFamily: { ...family.canonicalFamily },
    members: family.memberProposals.map((member) => ({
      ...member,
      matchedAt: "2026-08-09T00:00:00.000Z",
    })),
  };
}

describe("model family backfill", () => {
  it("builds the Beyond Medals HIGH family with deterministic roles and identity", () => {
    const plan = logicalPlan();
    const family = plan.families[0];

    expect(family.identityKey).toBe("v1|bataleon|beyond medals|2024/2025");
    expect(family.slug).toBe("bataleon-beyond-medals");
    expect(family.memberProposals.map((member) => member.role).sort()).toEqual([
      "base",
      "wide",
    ]);
  });

  it("keeps logical ordering and hash stable when candidate input order changes", () => {
    const secondProducts = [
      product({
        id: "00000000-0000-0000-0000-000000000003",
        slug: "rome-agent",
        brand: "Rome",
        modelName: "Agent",
        seasonLabel: "2025/2026",
      }),
      product({
        id: "00000000-0000-0000-0000-000000000004",
        slug: "rome-agent-wide",
        brand: "Rome",
        modelName: "Agent Wide",
        seasonLabel: "2025/2026",
      }),
    ];
    const secondFamily = highFamily({
      id: "width:rome:agent",
      brand: "Rome",
      canonicalCandidateModelName: "agent",
      normalizedSeason: "2025/2026",
      members: secondProducts.map((item) => ({
        id: item.id,
        slug: item.slug,
        brand: item.brand,
        modelName: item.modelName,
        seasonLabel: item.seasonLabel,
      })),
    });
    const first = buildBackfillLogicalPlan({
      analysis: analysis([highFamily(), secondFamily]),
      products: [...products(), ...secondProducts],
      baselineRepositorySha: "baseline-sha",
      snapshot,
    });
    const second = buildBackfillLogicalPlan({
      analysis: analysis([secondFamily, highFamily()]),
      products: [...secondProducts].reverse().concat([...products()].reverse()),
      baselineRepositorySha: "baseline-sha",
      snapshot,
    });

    expect(buildPlanArtifact(first, "one").planHash).toBe(
      buildPlanArtifact(second, "two").planHash,
    );
  });

  it("rejects a Product assigned to two HIGH proposals", () => {
    expect(() =>
      logicalPlan({ analysis: analysis([highFamily(), highFamily({ id: "duplicate" })]) }),
    ).toThrow(/multiple HIGH families/u);
  });

  it("rejects missing or ambiguous base and explicit-wide roles", () => {
    const invalid = highFamily({
      members: highFamily().members.map((member) => ({
        ...member,
        modelName: `${member.modelName} W`,
      })),
    });

    expect(() => logicalPlan({ analysis: analysis([invalid]) })).toThrow(
      /one clean base and one explicit Wide/u,
    );
  });

  it("uses base display metadata and normalized values only for identity", () => {
    const plan = logicalPlan();
    const family = plan.families[0];

    expect(family.brand).toBe("Bataleon");
    expect(family.modelName).toBe("Beyond Medals");
    expect(family.identityKey).toContain("|bataleon|beyond medals|");
    expect(family.canonicalFamily.canonicalSourceKind).toBe("fallback-member");
  });

  it("rejects missing or different seasons", () => {
    const missingProducts = products().map((item) => ({ ...item, seasonLabel: null }));
    const missingFamily = highFamily({
      normalizedSeason: null,
      members: highFamily().members.map((member) => ({
        ...member,
        seasonLabel: null,
      })),
    });
    expect(() =>
      logicalPlan({ analysis: analysis([missingFamily]), products: missingProducts }),
    ).toThrow(/matching known season/u);

    const changedProducts = products();
    changedProducts[1] = { ...changedProducts[1], seasonLabel: "2025/2026" };
    expect(() => logicalPlan({ products: changedProducts })).toThrow(
      /matching known season/u,
    );
  });

  it("classifies an exact family and provenance state as a NOOP", () => {
    const plan = logicalPlan();
    expect(compareExistingBackfillState(plan, [exactExistingFamily(plan)])).toEqual({
      status: "NOOP",
      reasons: [],
      matchedAt: "2026-08-09T00:00:00.000Z",
    });
  });

  it("classifies partial or conflicting family state as a conflict", () => {
    const plan = logicalPlan();
    const existing = exactExistingFamily(plan);
    existing.members[0] = {
      ...existing.members[0],
      role: "wide",
      manualOverride: true,
    };
    existing.members.push({ ...existing.members[1], productId: "unexpected" });

    const comparison = compareExistingBackfillState(plan, [existing]);
    expect(comparison.status).toBe("CONFLICT");
    expect(comparison.reasons).not.toHaveLength(0);
  });
});
