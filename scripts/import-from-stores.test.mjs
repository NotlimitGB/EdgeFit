import { describe, expect, it } from "vitest";
import {
  assertTrialSportSourceComplete,
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

describe("Trial Sport source completeness gate", () => {
  it("blocks an incomplete source before stale handling", () => {
    expect(() => assertTrialSportSourceComplete({ complete: false })).toThrow(
      "INCOMPLETE_TRIAL_SPORT_SOURCE",
    );
    expect(() => assertTrialSportSourceComplete(null)).toThrow(
      "INCOMPLETE_TRIAL_SPORT_SOURCE",
    );
    expect(() => assertTrialSportSourceComplete({ complete: true })).not.toThrow();
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
    });

    expect(decision.staleProducts).toEqual([existing]);
    expect(decision.trialProductsRequiringRevalidation).toEqual([]);
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

    expect(decision.staleProducts).toEqual([traektoria]);
    expect(decision.preservedProducts).toEqual([trial]);
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
