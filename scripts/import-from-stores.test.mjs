import { describe, expect, it } from "vitest";
import {
  assertTraektoriaStaleSafe,
  assertTrialSportStaleSafe,
  buildStaleProductDecision,
  loadExistingCatalog,
  mergeWithExistingProduct,
} from "./import-from-stores.mjs";
import { getRecommendation } from "../src/lib/recommendation/engine.ts";

function createCatalogSql(productRow) {
  const queries = [];
  const sql = async (strings, ...values) => {
    const query = strings.reduce(
      (text, part, index) => text + part + (values[index] ?? ""),
      "",
    );
    queries.push(query);

    if (query.includes("information_schema.columns")) {
      return [
        { table_name: "products", column_name: "season_label" },
        { table_name: "products", column_name: "gallery_images" },
        { table_name: "product_sizes", column_name: "size_label" },
        { table_name: "product_sizes", column_name: "is_available" },
      ];
    }

    return [productRow];
  };
  sql.unsafe = (value) => value;
  return { sql, queries };
}

function makeProduct({
  slug,
  storeCode = "trial-sport",
  sourceProductId,
}) {
  const affiliateUrl =
    storeCode === "trial-sport"
      ? `https://trial-sport.ru/goods/51526/${sourceProductId}.html`
      : `https://www.traektoria.ru/product/${sourceProductId}_${slug}/`;

  return {
    slug,
    affiliateUrl,
    isActive: true,
  };
}

describe("Trial Sport stale-safety gate", () => {
  it("allows import-incomplete evidence only when stale-safe", () => {
    expect(() => assertTrialSportStaleSafe({ staleSafe: false })).toThrow(
      "INCOMPLETE_TRIAL_SPORT_SOURCE",
    );
    expect(() => assertTrialSportStaleSafe(null)).toThrow(
      "INCOMPLETE_TRIAL_SPORT_SOURCE",
    );
    expect(() =>
      assertTrialSportStaleSafe({ importComplete: false, staleSafe: true }),
    ).not.toThrow();
  });
});

describe("Traektoria stale-safety gate", () => {
  it("allows import-incomplete evidence only when stale-safe", () => {
    expect(() => assertTraektoriaStaleSafe({ staleSafe: false })).toThrow(
      "INCOMPLETE_TRAEKTORIA_SOURCE",
    );
    expect(() => assertTraektoriaStaleSafe(null)).toThrow(
      "INCOMPLETE_TRAEKTORIA_SOURCE",
    );
    expect(() =>
      assertTraektoriaStaleSafe({ importComplete: false, staleSafe: true }),
    ).not.toThrow();
  });
});

describe("trusted existing identity preservation", () => {
  it("does not erase known season or line when fresh merchant evidence is missing", () => {
    const existing = {
      dataStatus: "draft",
      boardLine: "men",
      seasonLabel: "2025/2026",
    };
    const imported = {
      boardLine: "unisex",
      seasonLabel: null,
      importMeta: { boardLineEvidence: "missing" },
      sizes: [],
    };

    expect(mergeWithExistingProduct(existing, imported)).toEqual(
      expect.objectContaining({
        boardLine: "men",
        seasonLabel: "2025/2026",
      }),
    );
  });

  it("accepts explicit current merchant identity evidence", () => {
    const existing = {
      dataStatus: "draft",
      boardLine: "men",
      seasonLabel: null,
    };
    const imported = {
      boardLine: "women",
      seasonLabel: "2026/2027",
      importMeta: { boardLineEvidence: "known" },
      sizes: [],
    };

    expect(mergeWithExistingProduct(existing, imported)).toEqual(
      expect.objectContaining({
        boardLine: "women",
        seasonLabel: "2026/2027",
      }),
    );
  });
});

describe("existing catalog recommendation shape", () => {
  it("loads the persisted camber profile instead of inventing a null-to-camber delta", async () => {
    const row = {
      id: "product-1",
      slug: "nitro-team",
      brand: "Nitro",
      modelName: "Team",
      seasonLabel: "2025/2026",
      descriptionShort: "Team",
      descriptionFull: "Team",
      ridingStyle: "all-mountain",
      skillLevel: "intermediate",
      flex: 7,
      priceFrom: 35090,
      imageUrl: "https://example.com/team.jpg",
      galleryImages: [],
      affiliateUrl: "https://trial-sport.ru/goods/51526/3131513.html",
      isActive: true,
      boardLine: "men",
      shapeType: "directional-twin",
      camberProfile: "camber",
      dataStatus: "verified",
      sourceName: "Official Nitro Team 2026",
      sourceUrl: "https://www.nitrosnowboards.com/products/team-snowboard",
      sourceCheckedAt: "2026-04-14",
      scenarios: [],
      notIdealFor: [],
      familyId: null,
      familyMemberRole: null,
      familyMatchMethod: null,
      familyMatchConfidence: null,
      familyManualOverride: false,
      familyMatchReason: null,
      familyMatchedAt: null,
      updatedAt: "2026-08-20T00:00:00.000Z",
      sizes: [
        {
          sizeCm: 159,
          sizeLabel: "159 cm",
          waistWidthMm: 254,
          recommendedWeightMin: 0,
          recommendedWeightMax: null,
          widthType: "regular",
          isAvailable: true,
        },
      ],
    };
    const { sql, queries } = createCatalogSql(row);

    const catalog = await loadExistingCatalog(sql);

    expect(queries[1]).toContain('p.camber_profile as "camberProfile"');
    expect(catalog.get("nitro-team")).toMatchObject({
      camberProfile: "camber",
    });

    const loaded = catalog.get("nitro-team");
    const input = {
      heightCm: 160,
      weightKg: 70,
      bootSizeEu: 39,
      boardLinePreference: "men",
      skillLevel: "intermediate",
      ridingStyle: "freeride",
      terrainPriority: "balanced",
      aggressiveness: "aggressive",
      stanceType: "standard",
    };
    const loadedResult = getRecommendation(input, [loaded]);
    const equivalentFullShapeResult = getRecommendation(input, [
      { ...loaded, camberProfile: "camber" },
    ]);
    const omittedCamberResult = getRecommendation(input, [
      { ...loaded, camberProfile: null },
    ]);

    expect(loadedResult.recommendedBoards[0]?.score).toBe(
      equivalentFullShapeResult.recommendedBoards[0]?.score,
    );
    expect(loadedResult.recommendedBoards[0]?.score).toBeGreaterThan(
      omittedCamberResult.recommendedBoards[0]?.score ?? -Infinity,
    );
  });
});

describe("safe managed-store stale decisions", () => {
  it("requires revalidation instead of deactivating an unresolved Trial Product", () => {
    const existing = makeProduct({
      slug: "existing-trial",
      sourceProductId: "1001",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "trial-sport",
    });

    expect(decision.staleProducts).toEqual([]);
    expect(decision.trialProductsRequiringRevalidation).toEqual([existing]);
  });

  it("preserves a live Trial Product missing from listing discovery", () => {
    const existing = makeProduct({
      slug: "still-live",
      sourceProductId: "1002",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "trial",
      trialRevalidationOutcomes: [
        { slug: existing.slug, status: "available" },
      ],
    });

    expect(decision.staleProducts).toEqual([]);
    expect(decision.preservedProducts).toEqual([existing]);
  });

  it("allows a reliably unavailable Trial Product to become stale", () => {
    const existing = makeProduct({
      slug: "discontinued",
      sourceProductId: "1003",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "all",
      trialRevalidationOutcomes: [
        { slug: existing.slug, status: "unavailable" },
      ],
    });

    expect(decision.staleProducts).toEqual([existing]);
    expect(decision.blockingTrialProducts).toEqual([]);
  });

  it("fails closed when direct revalidation is unknown", () => {
    const existing = makeProduct({
      slug: "uncertain",
      sourceProductId: "1004",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "all",
      trialRevalidationOutcomes: [{ slug: existing.slug, status: "unknown" }],
    });

    expect(decision.staleProducts).toEqual([]);
    expect(decision.blockingTrialProducts).toEqual([existing]);
  });

  it("allows exact source-ID replacement only after resolution", () => {
    const existing = makeProduct({
      slug: "old-slug",
      sourceProductId: "1005",
    });
    const replacement = makeProduct({
      slug: "new-slug",
      sourceProductId: "1005",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [replacement],
      sourceFilter: "all",
      trialSourceObservations: [
        {
          storeCode: "trial-sport",
          sourceProductId: "1005",
          availability: "available",
          status: "safe_unimportable",
          reason: "spec_group_missing",
        },
      ],
    });

    expect(decision.staleProducts).toEqual([existing]);
    expect(decision.trialProductsRequiringRevalidation).toEqual([]);
  });

  it("preserves an observed safe-unimportable existing Trial Product", () => {
    const existing = makeProduct({
      slug: "observed-without-specs",
      sourceProductId: "1008",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "trial-sport",
      trialSourceObservations: [
        {
          storeCode: "trial-sport",
          sourceProductId: "1008",
          availability: "available",
          status: "safe_unimportable",
          reason: "spec_missing",
        },
      ],
    });

    expect(decision.preservedProducts).toEqual([existing]);
    expect(decision.staleProducts).toEqual([]);
    expect(decision.trialProductsRequiringRevalidation).toEqual([]);
  });

  it("preserves an available Trial Product quarantined for attribute truth", () => {
    const existing = makeProduct({
      slug: "trial-attribute-quarantine",
      sourceProductId: "1010",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "trial-sport",
      trialSourceObservations: [
        {
          storeCode: "trial-sport",
          sourceProductId: "1010",
          availability: "available",
          status: "safe_unimportable",
          reason: "attribute_truth_unresolved",
          unresolvedAttributes: ["flex", "skill_level"],
        },
      ],
    });

    expect(decision.preservedProducts).toEqual([existing]);
    expect(decision.staleProducts).toEqual([]);
    expect(decision.trialProductsRequiringRevalidation).toEqual([]);
  });

  it("does not let malformed observations bypass direct revalidation", () => {
    const existing = makeProduct({
      slug: "malformed-observation",
      sourceProductId: "1009",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "trial-sport",
      trialSourceObservations: [
        {
          storeCode: "trial-sport",
          sourceProductId: "1009",
          availability: "available",
          status: "safe_unimportable",
          reason: "unknown",
        },
      ],
    });

    expect(decision.preservedProducts).toEqual([]);
    expect(decision.trialProductsRequiringRevalidation).toEqual([existing]);
  });

  it("keeps Traektoria cleanup independent from Trial revalidation", () => {
    const trial = makeProduct({
      slug: "trial-live",
      sourceProductId: "1006",
    });
    const traektoria = makeProduct({
      slug: "traektoria-stale",
      sourceProductId: "2001",
      storeCode: "traektoria",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [trial, traektoria],
      resolvedProducts: [],
      sourceFilter: "all",
      trialRevalidationOutcomes: [{ slug: trial.slug, status: "available" }],
    });

    expect(decision.staleProducts).toEqual([]);
    expect(decision.preservedProducts).toEqual([trial]);
    expect(decision.traektoriaProductsRequiringRevalidation).toEqual([
      traektoria,
    ]);
  });

  it("preserves an observed available Traektoria Product", () => {
    const existing = makeProduct({
      slug: "traektoria-observed",
      sourceProductId: "2002",
      storeCode: "traektoria",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "traektoria",
      traektoriaSourceObservations: [
        {
          storeCode: "traektoria",
          sourceProductId: "2002",
          availability: "available",
          status: "safe_unimportable",
          reason: "size_table_missing",
        },
      ],
    });

    expect(decision.preservedProducts).toEqual([existing]);
    expect(decision.staleProducts).toEqual([]);
    expect(decision.traektoriaProductsRequiringRevalidation).toEqual([]);
  });

  it("uses a trustworthy unavailable Traektoria observation as stale evidence", () => {
    const existing = makeProduct({
      slug: "traektoria-unavailable",
      sourceProductId: "2003",
      storeCode: "traektoria",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "traektoria",
      traektoriaSourceObservations: [
        {
          storeCode: "traektoria",
          sourceProductId: "2003",
          availability: "unavailable",
          status: "safe_unimportable",
          reason: "size_table_missing",
        },
      ],
    });

    expect(decision.staleProducts).toEqual([existing]);
    expect(decision.traektoriaProductsRequiringRevalidation).toEqual([]);
  });

  it.each([
    ["available", "preservedProducts"],
    ["unavailable", "staleProducts"],
  ])("uses %s Traektoria attribute truth evidence safely", (availability, bucket) => {
    const existing = makeProduct({
      slug: `traektoria-attribute-${availability}`,
      sourceProductId: "2008",
      storeCode: "traektoria",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "traektoria",
      traektoriaSourceObservations: [
        {
          storeCode: "traektoria",
          sourceProductId: "2008",
          availability,
          status: "safe_unimportable",
          reason: "attribute_truth_unresolved",
          unresolvedAttributes: ["riding_style"],
        },
      ],
    });

    expect(decision[bucket]).toEqual([existing]);
    expect(decision.traektoriaProductsRequiringRevalidation).toEqual([]);
  });

  it("does not trust an unknown Traektoria safe-observation reason", () => {
    const existing = makeProduct({
      slug: "traektoria-malformed-observation",
      sourceProductId: "2009",
      storeCode: "traektoria",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [],
      sourceFilter: "traektoria",
      traektoriaSourceObservations: [
        {
          storeCode: "traektoria",
          sourceProductId: "2009",
          availability: "available",
          status: "safe_unimportable",
          reason: "unknown",
        },
      ],
    });

    expect(decision.preservedProducts).toEqual([]);
    expect(decision.traektoriaProductsRequiringRevalidation).toEqual([existing]);
  });

  it("applies Traektoria direct revalidation outcomes fail-closed", () => {
    const available = makeProduct({
      slug: "traektoria-available",
      sourceProductId: "2004",
      storeCode: "traektoria",
    });
    const unavailable = makeProduct({
      slug: "traektoria-gone",
      sourceProductId: "2005",
      storeCode: "traektoria",
    });
    const unknown = makeProduct({
      slug: "traektoria-unknown",
      sourceProductId: "2006",
      storeCode: "traektoria",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [available, unavailable, unknown],
      resolvedProducts: [],
      sourceFilter: "all",
      traektoriaRevalidationOutcomes: [
        { slug: available.slug, status: "available" },
        { slug: unavailable.slug, status: "unavailable" },
        { slug: unknown.slug, status: "unknown" },
      ],
    });

    expect(decision.preservedProducts).toEqual([available]);
    expect(decision.staleProducts).toEqual([unavailable]);
    expect(decision.blockingTraektoriaProducts).toEqual([unknown]);
  });

  it("preserves Traektoria replacement semantics for the same source ID", () => {
    const existing = makeProduct({
      slug: "traektoria-old",
      sourceProductId: "2007",
      storeCode: "traektoria",
    });
    const replacement = makeProduct({
      slug: "traektoria-new",
      sourceProductId: "2007",
      storeCode: "traektoria",
    });

    const decision = buildStaleProductDecision({
      existingProducts: [existing],
      resolvedProducts: [replacement],
      sourceFilter: "all",
      traektoriaSourceObservations: [
        {
          storeCode: "traektoria",
          sourceProductId: "2007",
          availability: "available",
          status: "safe_unimportable",
          reason: "size_table_missing",
        },
      ],
    });

    expect(decision.staleProducts).toEqual([existing]);
    expect(decision.traektoriaProductsRequiringRevalidation).toEqual([]);
  });

  it("does not revalidate Products that are already inactive", () => {
    const inactive = {
      ...makeProduct({ slug: "already-inactive", sourceProductId: "1007" }),
      isActive: false,
    };

    const decision = buildStaleProductDecision({
      existingProducts: [inactive],
      resolvedProducts: [],
      sourceFilter: "all",
    });

    expect(decision.staleProducts).toEqual([]);
    expect(decision.trialProductsRequiringRevalidation).toEqual([]);
  });
});
