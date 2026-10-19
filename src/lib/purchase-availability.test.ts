import { describe, expect, it } from "vitest";
import {
  evaluatePurchaseAvailability, legacyPurchaseAvailability,
  type AvailabilityEvidenceOffer, type AvailabilitySourcePolicy, type CurrentAvailabilityAuthority,
} from "./purchase-availability";

const now = new Date("2026-10-19T12:00:00Z");
const identity = { boardKind: "FAMILY" as const, boardId: "fixture-season-2025-2026",
  boardSlug: "yes-hell-yes", sizeCm: 149, displaySizeLabel: "149", identityKey: "fixture:149:regular" };
const authority: CurrentAvailabilityAuthority = {
  basis: "CURRENT_TABLES", merchantSlug: "fixture-merchant", merchantProductId: "product-a",
  merchantProductKey: "sku-a", sourceKind: "MANUAL_VERIFIED", merchantStatus: "ACTIVE",
  sourceStatus: "ACTIVE", commercialRightsStatus: "AUTHORIZED", rightsEvidenceRef: "fixture-rights",
};
// Synthetic boundary values, not a production cadence or policy.
const policy: AvailabilitySourcePolicy = { ...authority, version: "fixture-only-v1",
  freshThroughMs: 60_000, staleAfterMs: 120_000 };
function offer(overrides: Partial<AvailabilityEvidenceOffer> = {}): AvailabilityEvidenceOffer {
  return {
    id: "observation-a", merchantSlug: authority.merchantSlug, merchantStatus: "ACTIVE", sourceStatus: "ACTIVE",
    sourceKind: "MANUAL_VERIFIED", commercialRightsStatus: "AUTHORIZED", rightsEvidenceRef: "fixture-rights",
    merchantProductId: "product-a", merchantProductKey: "sku-a", sourceIdentityKey: "sku:149", merchantSizeSku: "149",
    identity, availabilityStatus: "IN_STOCK", merchantProductUrl: "https://fixture.test/product-a",
    merchantSizeUrl: "https://fixture.test/product-a/149", sourceUrl: "https://fixture.test/evidence",
    feedVersion: null, checksum: null, feedGeneratedAt: null, merchantUpdatedAt: null,
    sourceReceivedAt: now, observedAt: now, reconciliationStatus: "MATCHED", reconciliationCodes: [], price: null,
    availability: { scope: "EXACT_SIZE", observedAt: now, evidenceRef: "fixture-stock", sourceUrl: "https://fixture.test/evidence",
      merchantUpdatedAt: null, ingestedAt: now }, ...overrides,
  };
}
function evaluate(offers = [offer()], overrides: Partial<Parameters<typeof evaluatePurchaseAvailability>[0]> = {}) {
  return evaluatePurchaseAvailability({ offers, requestedIdentity: identity, authority: [authority], policies: [policy], now, ...overrides });
}
function at(age: number, status: AvailabilityEvidenceOffer["availabilityStatus"] = "IN_STOCK") {
  const row = offer({ availabilityStatus: status });
  return { ...row, availability: { ...row.availability!, observedAt: new Date(now.getTime() - age) } };
}

describe("physical-fit-independent merchant availability compatibility", () => {
  it("never infers current state from legacy flags, common clocks, price or a merchant link", () => {
    expect(legacyPurchaseAvailability()).toEqual({ status: "unknown", freshness: "UNKNOWN", observedStockStatus: "UNKNOWN" });
    expect(evaluate([offer({ availability: null })])).toEqual(legacyPurchaseAvailability());
    expect(evaluate([], {})).toEqual(legacyPurchaseAvailability());
  });
  it("allows a fully evidenced synthetic exact-size observation independently of price", () => {
    expect(evaluate()).toEqual({ status: "verified_available", freshness: "FRESH", observedStockStatus: "IN_STOCK" });
    expect(evaluate([offer({ price: { amount: 1, currency: "EUR", scope: "PRODUCT", observedAt: null,
      feedGeneratedAt: null, merchantUpdatedAt: null, sourceReceivedAt: null, sourceUrl: "https://fixture.test/price" } })]))
      .toEqual(evaluate());
  });
  it.each([
    [0, "FRESH", "verified_available"], [60_000, "FRESH", "verified_available"],
    [60_001, "AGING", "unknown"], [120_000, "AGING", "unknown"], [120_001, "STALE", "unknown"],
  ])("classifies age %s with explicit fixture-only policy", (age, freshness, status) => {
    expect(evaluate([at(Number(age))])).toMatchObject({ freshness, status });
  });
  it.each(["OUT_OF_STOCK", "PREORDER", "UNKNOWN"] as const)("keeps the explicit %s observation", (stock) => {
    expect(evaluate([offer({ availabilityStatus: stock })])).toMatchObject({
      status: stock === "OUT_OF_STOCK" ? "verified_unavailable" : "unknown", observedStockStatus: stock,
    });
  });
  it.each([null, "2026-02-30T12:00:00Z", "2026-10-20T12:00:00Z", "bad", new Date(NaN)])(
    "rejects absent, invalid, impossible or future independent time %s", (observedAt) => {
      const row = offer();
      expect(evaluate([{ ...row, availability: { ...row.availability!, observedAt } }]).status).toBe("unknown");
    });
  it("accepts calendar-valid leap dates, offsets and fractional seconds", () => {
    const row = offer();
    expect(evaluate([{ ...row, availability: { ...row.availability!, observedAt: "2024-02-29T15:00:00.123+03:00",
      ingestedAt: "2024-02-29T12:00:00.123Z" } }],
      { now: new Date("2024-02-29T12:00:00.123Z") }).status).toBe("verified_available");
  });
  it("requires policy, provenance, current authority, active source and authorized rights", () => {
    expect(evaluate([offer()], { policies: [] }).status).toBe("unknown");
    expect(evaluate([offer()], { authority: [] }).status).toBe("unknown");
    expect(evaluate([offer()], { authority: [authority, { ...authority, sourceStatus: "INACTIVE" }] }).status).toBe("unknown");
    for (const patch of [{ merchantStatus: "INACTIVE" }, { sourceStatus: "INACTIVE" },
      { commercialRightsStatus: "RESTRICTED" }, { commercialRightsStatus: "UNKNOWN" }, { rightsEvidenceRef: null }] as const) {
      expect(evaluate([offer()], { authority: [{ ...authority, ...patch }] }).status).toBe("unknown");
    }
    for (const patch of [{ merchantStatus: "INACTIVE" }, { sourceStatus: "INACTIVE" },
      { rightsEvidenceRef: null }, { reconciliationStatus: "CONFLICT" }, { reconciliationCodes: ["SUPERSEDED"] },
      { sourceKind: "LEGACY_IMPORT" }, { sourceKind: "PUBLIC_REFERENCE" }] as const) {
      expect(evaluate([offer(patch as Partial<AvailabilityEvidenceOffer>)]).status).toBe("unknown");
    }
    const row = offer();
    expect(evaluate([{ ...row, availability: { ...row.availability!, evidenceRef: null } }]).status).toBe("unknown");
  });
  it("does not transfer product-level stock, another season, size, merchant or SKU", () => {
    const row = offer();
    expect(evaluate([{ ...row, availability: { ...row.availability!, scope: "PRODUCT" } }]).status).toBe("unknown");
    for (const patch of [{ boardId: "other-season" }, { displaySizeLabel: "149W", identityKey: "fixture:149:wide" },
      { displaySizeLabel: "149MW", identityKey: "fixture:149:mid-wide" }, { boardSlug: "other-board" }]) {
      expect(evaluate([offer({ identity: { ...identity, ...patch } })]).status).toBe("unknown");
    }
    for (const patch of [{ merchantProductId: "other-sku" }, { merchantSlug: "other-merchant" }]) {
      expect(evaluate([offer(patch)]).status).toBe("unknown");
    }
  });
  it("blocks equal-time conflicts and accepts a later evidenced correction without using ingestion order", () => {
    const older = at(1000), corrected = at(0, "OUT_OF_STOCK");
    const conflict = offer({ availabilityStatus: "OUT_OF_STOCK" });
    expect(evaluate([offer(), conflict]).status).toBe("unknown");
    expect(evaluate([conflict, offer()]).status).toBe("unknown");
    expect(evaluate([older, corrected]).status).toBe("verified_unavailable");
    expect(evaluate([corrected, older])).toEqual(evaluate([older, corrected]));
    expect(evaluate([older, offer({ availabilityStatus: "UNKNOWN" })]).status).toBe("unknown");
  });
  it("does not hide a conflicting canonical mapping by filtering it out first", () => {
    const conflicting = offer({ identity: { ...identity, boardId: "other-season", identityKey: "other-season:149" } });
    expect(evaluate([offer(), conflicting]).status).toBe("unknown");
    expect(evaluate([conflicting, offer()]).status).toBe("unknown");
  });
  it("applies merchant deactivation across that merchant's sources without mixing merchants", () => {
    const revoked: CurrentAvailabilityAuthority = { ...authority, merchantProductId: "other-product",
      merchantProductKey: "other-source", merchantStatus: "INACTIVE" };
    expect(evaluate([offer()], { authority: [authority, revoked] }).status).toBe("unknown");
    expect(evaluate([offer()], { authority: [authority, { ...revoked, merchantSlug: "different-merchant" }] }).status).toBe("verified_available");
  });
  it("rejects invalid thresholds and never refreshes old stock when authority is restored", () => {
    expect(() => evaluate([offer()], { policies: [{ ...policy, freshThroughMs: -1 }] })).toThrow();
    expect(evaluate([at(200_000)], { authority: [authority] })).toMatchObject({ status: "unknown", freshness: "STALE" });
  });
});
