import { describe, expect, it } from "vitest";
import {
  assertTraektoriaStaleSafe,
  assertTrialSportStaleSafe,
  buildStaleProductDecision,
} from "./import-from-stores.mjs";

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
