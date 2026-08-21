import { describe, expect, it } from "vitest";
import { buildSourceIdentityPlan } from "./source-identity.mjs";
import {
  assertSourceIdentityAuthorization,
  buildSourceIdentityAuthorizationPlan,
  SOURCE_IDENTITY_AUTHORIZATION_CODES,
} from "./source-identity-authorization.mjs";

function product({
  id,
  slug = "brand-board",
  baseSlug = slug,
  brand = "Brand",
  modelName = "Board",
  storeCode = "traektoria",
  sourceProductId = "100",
  boardLine = "men",
  boardLineEvidence = "known",
  seasonLabel = "2025/2026",
  variantMarker = null,
  priceFrom = 40_000,
  isActive = true,
  available = true,
  sizeLabel = "158",
  familyManualOverride = false,
  identityAuthorizationEvidence,
} = {}) {
  const affiliateUrl =
    storeCode === "trial-sport"
      ? `https://trial-sport.ru/goods/51526/${sourceProductId}.html`
      : `https://www.traektoria.ru/product/${sourceProductId}_${slug}/`;
  return {
    id,
    slug,
    brand,
    modelName,
    boardLine,
    seasonLabel,
    priceFrom,
    affiliateUrl,
    sourceUrl: affiliateUrl,
    isActive,
    familyManualOverride,
    sizes: [
      {
        sizeLabel,
        sizeCm: Number.parseFloat(sizeLabel),
        waistWidthMm: 255,
        widthType: variantMarker === "wide" ? "wide" : "regular",
        isAvailable: available,
      },
    ],
    importMeta: {
      storeCode,
      sourceProductId,
      baseSlug,
      boardLineEvidence,
      variantMarker,
      identityAuthorizationEvidence,
    },
  };
}

function authorization(importedProducts, existingProducts = [], officialSpecs = new Map()) {
  const identityPlan = buildSourceIdentityPlan({
    importedProducts,
    existingProducts,
    officialSpecs,
  });
  return buildSourceIdentityAuthorizationPlan({
    identityPlan,
    importedProducts,
    existingProducts,
    officialSpecs,
  });
}

function onlyDecision(plan) {
  const groups = [...plan.autoGroups, ...plan.reviewGroups, ...plan.blockGroups]
    .filter((group) => group.baseSlug !== "__plan__");
  expect(groups).toHaveLength(1);
  return groups[0];
}

function expectDecision(plan, decision, reason) {
  const group = onlyDecision(plan);
  expect(group.decision).toBe(decision);
  if (reason) expect(group.reasonCodes).toContain(reason);
  return group;
}

describe("source identity unattended authorization policy", () => {
  it("keeps the canonical Frontier 2.0 owner stable after duplicate cleanup", () => {
    const erroneousSeed = {
      ...product({
        id: "45dd5ecc-1e4d-4aa9-b56c-493c7eed0310",
        slug: "jones-frontier",
        brand: "Jones",
        modelName: "Frontier",
        isActive: false,
      }),
      affiliateUrl:
        "https://eu.jonessnowboards.com/products/mens-frontier-20-snowboard-2026",
      sourceUrl:
        "https://eu.jonessnowboards.com/products/mens-frontier-20-snowboard-2026",
      importMeta: undefined,
    };
    const canonical = product({
      id: "f057c0b7-f904-4648-8a28-03561ec44386",
      slug: "jones-frontier-2-0",
      baseSlug: "jones-frontier-2-0",
      brand: "Jones",
      modelName: "Frontier 2.0",
      sourceProductId: "1890649",
      boardLine: "men",
    });
    const imported = { ...canonical, id: undefined };
    const identityPlan = buildSourceIdentityPlan({
      importedProducts: [imported],
      existingProducts: [erroneousSeed, canonical],
    });
    const plan = buildSourceIdentityAuthorizationPlan({
      identityPlan,
      importedProducts: [imported],
      existingProducts: [erroneousSeed, canonical],
    });
    const decision = expectDecision(
      plan,
      "AUTO",
      "STABLE_PROTECTED_IDENTITIES",
    );

    expect(identityPlan.resolvedProducts).toHaveLength(1);
    expect(identityPlan.resolvedProducts[0].slug).toBe("jones-frontier-2-0");
    expect(decision.authorizationProjection.proposed).toEqual([
      expect.objectContaining({
        slug: "jones-frontier-2-0",
        existingProductId: canonical.id,
      }),
    ]);
    expect(decision.authorizationProjection.historicalOwnership).toEqual([
      expect.objectContaining({
        productId: canonical.id,
        slug: canonical.slug,
        sourceKey: "traektoria|1890649",
      }),
    ]);
    expect(
      decision.authorizationProjection.proposed.some(
        (assignment) => assignment.slug === erroneousSeed.slug,
      ),
    ).toBe(false);
  });

  it.each([
    ["new clean single-source model", product(), "NEW_CLEAN_SINGLE_SOURCE"],
    [
      "new clean brand",
      product({ brand: "Another", modelName: "Fresh", slug: "another-fresh" }),
      "NEW_CLEAN_SINGLE_SOURCE",
    ],
  ])("AUTO: %s", (_name, imported, reason) => {
    expectDecision(authorization([imported]), "AUTO", reason);
  });

  it("AUTO: new clean cross-store identity with complete protected evidence", () => {
    const imported = [
      product({ storeCode: "traektoria", sourceProductId: "101" }),
      product({ storeCode: "trial-sport", sourceProductId: "201" }),
    ];
    expectDecision(
      authorization(imported),
      "AUTO",
      "NEW_CLEAN_MULTI_SOURCE",
    );
  });

  it.each([
    ["price", { priceFrom: 45_000 }],
    ["availability", { available: false }],
    ["size availability", { available: false, sizeLabel: "159" }],
    ["affiliate URL", { slug: "brand-board-renamed-url" }],
  ])("AUTO: stable source identity commerce-only %s drift", (_name, patch) => {
    const existing = product({ id: "existing" });
    const imported = product({ ...patch, baseSlug: "brand-board", slug: "brand-board" });
    if (_name === "affiliate URL") {
      imported.affiliateUrl = `${existing.affiliateUrl}?campaign=fresh`;
      imported.sourceUrl = imported.affiliateUrl;
    }
    expectDecision(authorization([imported], [existing]), "AUTO");
  });

  it("AUTO: a compatible second merchant joins an existing identity", () => {
    const existing = product({ id: "existing", sourceProductId: "101" });
    const imported = [
      product({ sourceProductId: "101" }),
      product({ storeCode: "trial-sport", sourceProductId: "201" }),
    ];
    expectDecision(authorization(imported, [existing]), "AUTO");
  });

  it("AUTO: cosmetic model punctuation does not change identity", () => {
    const existing = product({ id: "existing", modelName: "Mega Board" });
    const imported = product({ modelName: "Mega-Board" });
    expectDecision(authorization([imported], [existing]), "AUTO");
  });

  it("AUTO: null to known season is safe metadata enrichment", () => {
    const existing = product({ id: "existing", seasonLabel: null });
    const imported = product({ seasonLabel: "2025/2026" });
    expectDecision(
      authorization([imported], [existing]),
      "AUTO",
      "SOURCE_IDENTITY_ENRICHED_NO_OWNERSHIP_CHANGE",
    );
  });

  it("AUTO: a trusted existing season is preserved when merchant evidence is missing", () => {
    const existing = product({ id: "existing", seasonLabel: "2025/2026" });
    const imported = product({ seasonLabel: null });
    expectDecision(
      authorization([imported], [existing]),
      "AUTO",
      "TRUSTED_EXISTING_IDENTITY_PRESERVED_WHEN_SOURCE_UNKNOWN",
    );
  });

  it("AUTO: a new season gets a protected deterministic suffix", () => {
    const existing = product({ id: "existing", sourceProductId: "100", seasonLabel: "2024/2025" });
    const imported = product({ sourceProductId: "101", seasonLabel: "2025/2026" });
    expectDecision(
      authorization([imported], [existing]),
      "AUTO",
      "NEW_PROTECTED_IDENTITY_SUFFIX",
    );
  });

  it("AUTO: a protected sibling uses fresh exact-owner evidence after safe enrichment", () => {
    const existing = product({
      id: "existing",
      boardLine: "unisex",
      boardLineEvidence: "missing",
      seasonLabel: null,
      sourceProductId: "100",
    });
    const imported = [
      product({
        boardLine: "unisex",
        boardLineEvidence: "known",
        seasonLabel: "FW26",
        sourceProductId: "100",
      }),
      product({
        boardLine: "men",
        boardLineEvidence: "known",
        seasonLabel: "FW22",
        sourceProductId: "101",
      }),
    ];

    expectDecision(
      authorization(imported, [existing]),
      "AUTO",
      "NEW_PROTECTED_IDENTITY_SUFFIX",
    );
  });

  it("BLOCK: fresh owner enrichment cannot bypass an exact-key line conflict", () => {
    const existing = product({
      id: "existing",
      boardLine: "men",
      boardLineEvidence: "known",
      sourceProductId: "100",
    });
    const imported = [
      product({
        boardLine: "women",
        boardLineEvidence: "known",
        sourceProductId: "100",
      }),
      product({
        boardLine: "men",
        boardLineEvidence: "known",
        sourceProductId: "101",
      }),
    ];

    expectDecision(
      authorization(imported, [existing]),
      "BLOCK",
      "SOURCE_ID_REUSE_BOARD_LINE_CONFLICT",
    );
  });

  it("AUTO: an explicit Wide sibling remains a distinct protected identity", () => {
    const existing = product({ id: "existing", sourceProductId: "100" });
    const imported = [
      product({ sourceProductId: "100" }),
      product({
        slug: "brand-board-wide",
        baseSlug: "brand-board",
        modelName: "Board Wide",
        sourceProductId: "101",
        variantMarker: "wide",
      }),
    ];
    const plan = authorization(imported, [existing]);
    expectDecision(plan, "AUTO", "NEW_PROTECTED_IDENTITY_SUFFIX");
  });

  it("AUTO: an inactive historical owner retains the canonical base", () => {
    const existing = product({ id: "existing", isActive: false });
    expectDecision(authorization([product()], [existing]), "AUTO");
  });

  it("REVIEW: an otherwise compatible replacement source ID cannot silently replace history", () => {
    const existing = product({ id: "existing", sourceProductId: "100" });
    const imported = product({ sourceProductId: "101" });
    expectDecision(
      authorization([imported], [existing]),
      "REVIEW",
      "COLLISION_SUFFIX_REVIEW",
    );
  });

  it("REVIEW: cross-store merge with incomplete season evidence", () => {
    const imported = [
      product({ sourceProductId: "101", seasonLabel: null }),
      product({ storeCode: "trial-sport", sourceProductId: "201", seasonLabel: null }),
    ];
    expectDecision(
      authorization(imported),
      "REVIEW",
      "INCOMPLETE_CROSS_STORE_EVIDENCE_REVIEW",
    );
  });

  it("REVIEW: missing to known board-line evidence that changes assignment topology", () => {
    const existing = product({
      id: "existing",
      boardLine: "unisex",
      boardLineEvidence: "missing",
    });
    const imported = product({ boardLine: "men", boardLineEvidence: "known" });
    expectDecision(
      authorization([imported], [existing]),
      "REVIEW",
      "COLLISION_SUFFIX_REVIEW",
    );
  });

  it("REVIEW: a material model alias requires explicit trusted evidence", () => {
    const existing = product({ id: "existing", modelName: "Old Name" });
    const imported = product({
      modelName: "New Name",
      identityAuthorizationEvidence: "trusted-alias",
    });
    expectDecision(
      authorization([imported], [existing]),
      "REVIEW",
      "SOURCE_IDENTITY_RENAME_REVIEW",
    );
  });

  it.each([
    [
      "men/women source-ID reuse",
      product({ id: "existing", boardLine: "men" }),
      product({ boardLine: "women" }),
      "SOURCE_ID_REUSE_BOARD_LINE_CONFLICT",
    ],
    [
      "adult/youth source-ID reuse",
      product({ id: "existing", modelName: "Board Adult" }),
      product({ modelName: "Board Kids" }),
      "PROTECTED_AUDIENCE_COLLAPSE",
    ],
    [
      "base/Wide source-ID reuse",
      product({ id: "existing", modelName: "Board", variantMarker: null }),
      product({ modelName: "Board Wide", variantMarker: "wide" }),
      "SOURCE_ID_REUSE_VARIANT_CONFLICT",
    ],
    [
      "known season change on the same source ID",
      product({ id: "existing", seasonLabel: "2024/2025" }),
      product({ seasonLabel: "2025/2026" }),
      "SOURCE_ID_REUSE_SEASON_CONFLICT",
    ],
    [
      "source ID reused by another brand",
      product({ id: "existing", brand: "Brand" }),
      product({ brand: "Other" }),
      "SOURCE_ID_REUSE_BRAND_CONFLICT",
    ],
    [
      "source ID reused by another model",
      product({ id: "existing", modelName: "Board" }),
      product({ modelName: "Other" }),
      "SOURCE_ID_REUSE_MODEL_CONFLICT",
    ],
  ])("BLOCK: %s", (_name, existing, imported, reason) => {
    expectDecision(authorization([imported], [existing]), "BLOCK", reason);
  });

  it("BLOCK: one source key cannot be proposed for two canonical Products", () => {
    const first = product({ baseSlug: "brand-one", slug: "brand-one" });
    const second = product({ baseSlug: "brand-two", slug: "brand-two" });
    const plan = authorization([first, second]);
    expect(plan.blockGroups.some((group) =>
      group.reasonCodes.includes("DUPLICATE_SOURCE_KEY_PROPOSAL"),
    )).toBe(true);
  });

  it("BLOCK: planner canonical takeover remains non-authorizable", () => {
    const existing = product({ id: "existing", sourceProductId: "100" });
    const imported = product({ sourceProductId: "101" });
    const identityPlan = buildSourceIdentityPlan({
      importedProducts: [imported],
      existingProducts: [existing],
    });
    identityPlan.logicalPlan.groups[0].assignments[0].slug = existing.slug;
    const plan = buildSourceIdentityAuthorizationPlan({
      identityPlan,
      importedProducts: [imported],
      existingProducts: [existing],
    });
    expectDecision(plan, "BLOCK", "HISTORICAL_BASE_TAKEOVER");
  });

  it("BLOCK: cross-brand slug collision remains non-authorizable", () => {
    const existing = product({ id: "existing", brand: "Brand" });
    const imported = product({ brand: "Other", sourceProductId: "101" });
    const identityPlan = buildSourceIdentityPlan({
      importedProducts: [imported],
      existingProducts: [existing],
    });
    identityPlan.logicalPlan.groups[0].assignments[0].slug = existing.slug;
    expectDecision(
      buildSourceIdentityAuthorizationPlan({
        identityPlan,
        importedProducts: [imported],
        existingProducts: [existing],
      }),
      "BLOCK",
      "CROSS_BRAND_SLUG_COLLISION",
    );
  });

  it("BLOCK: multiple historical base owners retain the planner blocker", () => {
    const existing = [
      product({ id: "one", sourceProductId: "100" }),
      product({ id: "two", sourceProductId: "101" }),
    ];
    const plan = authorization([product()], existing);
    expect(plan.blockGroups.some((group) =>
      group.reasonCodes.includes("PLANNER_BLOCKING_ISSUE"),
    )).toBe(true);
  });

  it("BLOCK: one current source cluster cannot own multiple historical slugs", () => {
    const existing = [
      product({ id: "one", slug: "brand-board-old-a" }),
      product({ id: "two", slug: "brand-board-old-b" }),
    ];
    const plan = authorization([product()], existing);
    expect(plan.blockGroups.some((group) =>
      group.reasonCodes.includes("PLANNER_BLOCKING_ISSUE"),
    )).toBe(true);
  });

  it("BLOCK: official board-line contradiction cannot be hash-authorized", () => {
    const specs = new Map([
      ["brand-board", { slug: "brand-board", boardLine: "women" }],
    ]);
    expectDecision(
      authorization([product({ boardLine: "men" })], [], specs),
      "BLOCK",
      "OFFICIAL_IDENTITY_CONTRADICTION",
    );
  });

  it("BLOCK: manual identity ownership cannot be reassigned", () => {
    const existing = product({
      id: "existing",
      sourceProductId: "100",
      familyManualOverride: true,
    });
    const imported = product({ sourceProductId: "101" });
    expectDecision(
      authorization([imported], [existing]),
      "BLOCK",
      "MANUAL_IDENTITY_REASSIGNMENT",
    );
  });

  it("BLOCK has precedence over review evidence", () => {
    const existing = product({ id: "existing", modelName: "Old", boardLine: "men" });
    const imported = product({
      modelName: "New",
      boardLine: "women",
      identityAuthorizationEvidence: "trusted-alias",
    });
    expectDecision(authorization([imported], [existing]), "BLOCK");
  });
});

describe("identity review projection and execution gate", () => {
  function reviewPlan({
    priceFrom = 40_000,
    modelName = "New Name",
    existingIsActive = true,
    available = true,
  } = {}) {
    const existing = product({
      id: "existing",
      modelName: "Old Name",
      isActive: existingIsActive,
    });
    const imported = product({
      modelName,
      priceFrom,
      available,
      identityAuthorizationEvidence: "trusted-alias",
    });
    return authorization([imported], [existing]);
  }

  it("is deterministic across source ordering", () => {
    const existing = product({ id: "existing", sourceProductId: "101" });
    const sources = [
      product({ sourceProductId: "101" }),
      product({ storeCode: "trial-sport", sourceProductId: "201" }),
    ];
    const first = authorization(sources, [existing]);
    const second = authorization([...sources].reverse(), [existing]);
    expect(first.identityReviewPlanHash).toBe(second.identityReviewPlanHash);
  });

  it.each([
    ["price", { priceFrom: 55_000 }],
    ["availability", { available: false }],
  ])("ignores routine %s drift in the review hash", (_name, patch) => {
    expect(reviewPlan().identityReviewPlanHash).toBe(
      reviewPlan(patch).identityReviewPlanHash,
    );
  });

  it("ignores existing Product activity drift in the review hash", () => {
    const active = reviewPlan({ existingIsActive: true });
    const inactive = reviewPlan({ existingIsActive: false });

    expect(active.reviewGroups.map((group) => group.decision)).toEqual([
      "REVIEW",
    ]);
    expect(inactive.reviewGroups.map((group) => group.decision)).toEqual([
      "REVIEW",
    ]);
    expect(active.reviewGroups.map((group) => group.reasonCodes)).toEqual(
      inactive.reviewGroups.map((group) => group.reasonCodes),
    );
    expect(active.reviewProjection).toEqual(inactive.reviewProjection);
    expect(active.identityReviewPlanHash).toBe(inactive.identityReviewPlanHash);
    expect(active.diagnosticPlanHash).not.toBe(inactive.diagnosticPlanHash);
  });

  it("changes the review hash when identity evidence changes", () => {
    expect(reviewPlan({ modelName: "New Name" }).identityReviewPlanHash).not.toBe(
      reviewPlan({ modelName: "Different Name" }).identityReviewPlanHash,
    );
  });

  it("requires, validates and consumes only an exact current review hash", () => {
    const plan = reviewPlan();
    expect(() =>
      assertSourceIdentityAuthorization({ authorizationPlan: plan }),
    ).toThrowError(expect.objectContaining({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.reviewRequired,
      catalogMayHaveCommitted: false,
    }));
    expect(() =>
      assertSourceIdentityAuthorization({
        authorizationPlan: plan,
        expectedIdentityReviewHash: "a".repeat(64),
      }),
    ).toThrowError(expect.objectContaining({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.reviewHashMismatch,
    }));
    expect(() =>
      assertSourceIdentityAuthorization({
        authorizationPlan: plan,
        expectedIdentityReviewHash: plan.identityReviewPlanHash,
      }),
    ).not.toThrow();
  });

  it("rejects malformed and stale review authorization before writes", () => {
    const auto = authorization([product()]);
    expect(() =>
      assertSourceIdentityAuthorization({
        authorizationPlan: auto,
        expectedIdentityReviewHash: "ABC",
      }),
    ).toThrowError(expect.objectContaining({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.malformedReviewHash,
    }));
    expect(() =>
      assertSourceIdentityAuthorization({
        authorizationPlan: auto,
        expectedIdentityReviewHash: "a".repeat(64),
      }),
    ).toThrowError(expect.objectContaining({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.staleReviewHash,
    }));
  });

  it("never lets a matching review hash authorize a BLOCK group", () => {
    const blocked = authorization(
      [product({ boardLine: "women" })],
      [product({ id: "existing", boardLine: "men" })],
    );
    expect(() =>
      assertSourceIdentityAuthorization({
        authorizationPlan: blocked,
        expectedIdentityReviewHash: blocked.identityReviewPlanHash,
      }),
    ).toThrowError(expect.objectContaining({
      code: SOURCE_IDENTITY_AUTHORIZATION_CODES.blocked,
    }));
  });
});
