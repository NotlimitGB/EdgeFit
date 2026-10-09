import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyOfferFreshness, evaluateCurrentExactSizeOffer, reconcileMerchantObservations, selectCurrentExactSizeOffers,
  type ExactSizeMerchantOfferSnapshot, type MerchantFreshnessPolicies } from "./merchant-offers";
import { projectMerchantOffer } from "./merchant-offer-presentation";

const NOW = new Date("2026-10-09T12:00:00Z");
// Test thresholds only; not a production source policy.
const policies: MerchantFreshnessPolicies = {
  price: { version: "fixture-price-v1", freshThroughMs: 3600000, staleAfterMs: 7200000 },
  availability: { version: "fixture-stock-v1", freshThroughMs: 600000, staleAfterMs: 1200000 },
};
const identity = { boardKind: "FAMILY" as const, boardId: "family-season-2025-2026",
  boardSlug: "bataleon-evil-twin-plus", sizeCm: 156, displaySizeLabel: "156",
  identityKey: '["canonical-size-v1","FAMILY","family-season-2025-2026",156,"156"]' };
function fixture(): ExactSizeMerchantOfferSnapshot {
  return {
    id: "offer-1", merchantSlug: "trial-sport", merchantStatus: "ACTIVE",
    merchantProductId: "product-1", merchantProductKey: "source-product-1",
    sourceKind: "MANUAL_VERIFIED", sourceStatus: "ACTIVE", commercialRightsStatus: "AUTHORIZED",
    rightsEvidenceRef: "fixture-permission-only", sourceIdentityKey: "sku:156", merchantSizeSku: "156",
    identity, availabilityStatus: "IN_STOCK", merchantProductUrl: "https://merchant.example/product",
    merchantSizeUrl: null, sourceUrl: "https://merchant.example/product", feedVersion: null, checksum: null,
    feedGeneratedAt: null, merchantUpdatedAt: null, sourceReceivedAt: NOW, observedAt: NOW,
    reconciliationStatus: "MATCHED", reconciliationCodes: [],
    availability: { scope: "EXACT_SIZE", observedAt: "2026-10-09T11:59:00Z", evidenceRef: "stock-1",
      sourceUrl: "https://merchant.example/product/156", merchantUpdatedAt: null, ingestedAt: NOW },
    price: { amount: 45919, currency: "RUB", scope: "EXACT_SIZE", observedAt: "2026-10-09T11:30:00Z",
      evidenceRef: "price-1", ingestedAt: NOW, feedGeneratedAt: null, merchantUpdatedAt: null,
      sourceReceivedAt: NOW, sourceUrl: "https://merchant.example/product/156" },
  };
}
function evaluate(offer = fixture(), policy: MerchantFreshnessPolicies | null = policies) {
  return evaluateCurrentExactSizeOffer(offer, identity, NOW, policy);
}

describe("independent merchant observation foundation", () => {
  it("requires both fresh exact-size metrics for purchase readiness", () => {
    expect(evaluate()).toMatchObject({ priceFreshness: "FRESH", availabilityFreshness: "FRESH",
      purchaseReady: true, currentPriceEligible: true, currentAvailabilityEligible: true });
  });
  it.each(["OUT_OF_STOCK", "PREORDER", "UNKNOWN"] as const)("retains price and information for %s without purchase readiness", (status) => {
    const offer = fixture(); offer.availabilityStatus = status;
    expect(evaluate(offer)).toMatchObject({ displayEligible: true, currentPriceEligible: true, purchaseReady: false });
    expect(projectMerchantOffer(offer, identity, NOW, policies).availability.observedStatus).toBe(status);
  });
  it("independently ages stock, never promotes stale IN_STOCK", () => {
    const offer = fixture(); offer.availability!.observedAt = "2026-10-09T11:00:00Z";
    expect(evaluate(offer)).toMatchObject({ priceFreshness: "FRESH", availabilityFreshness: "STALE", purchaseReady: false });
    expect(projectMerchantOffer(offer, identity, NOW, policies).availability).toMatchObject({ status: "UNKNOWN", observedStatus: "IN_STOCK" });
  });
  it("independently ages price while fresh availability remains informational", () => {
    const offer = fixture(); offer.price!.observedAt = "2026-10-09T09:00:00Z";
    expect(evaluate(offer)).toMatchObject({ priceFreshness: "STALE", availabilityFreshness: "FRESH", purchaseReady: false });
    expect(projectMerchantOffer(offer, identity, NOW, policies).price.label).toContain("Устаревшее");
  });
  it("does not treat AGING price as current or purchase-ready", () => {
    const offer = fixture(); offer.price!.observedAt = "2026-10-09T10:30:00Z";
    expect(evaluate(offer)).toMatchObject({ priceFreshness: "AGING", currentPriceEligible: false, purchaseReady: false });
  });
  it.each([null, "bad", "2026-10-10T00:00:00Z", "2026-10-09", "2026-10-09T11:00:00"])("rejects invalid/absent/future/non-zoned observation %s", (value) => {
    const offer = fixture(); offer.price!.observedAt = value; offer.availability!.observedAt = value;
    expect(evaluate(offer)).toMatchObject({ priceFreshness: "UNKNOWN", availabilityFreshness: "UNKNOWN", purchaseReady: false });
  });
  it.each([0, 3600000, 3600001, 7200000, 7200001])("classifies exact threshold boundary %s", (age) => {
    const expected = age <= 3600000 ? "FRESH" : age <= 7200000 ? "AGING" : "STALE";
    expect(classifyOfferFreshness(new Date(NOW.getTime() - age), NOW, policies.price!)).toBe(expected);
  });
  it("fails closed without source-specific policies", () => {
    expect(evaluate(fixture(), null)).toMatchObject({ priceFreshness: "UNKNOWN", availabilityFreshness: "UNKNOWN" });
    expect(evaluate(fixture(), { price: policies.price, availability: null })).toMatchObject({ priceFreshness: "FRESH", availabilityFreshness: "UNKNOWN" });
  });
  it.each([
    { version: "", freshThroughMs: 1, staleAfterMs: 2 },
    { version: "v", freshThroughMs: -1, staleAfterMs: 2 },
    { version: "v", freshThroughMs: 3, staleAfterMs: 2 },
    { version: "v", freshThroughMs: Infinity, staleAfterMs: Infinity },
  ])("rejects invalid explicit policy", (policy) => {
    expect(() => evaluate(fixture(), { price: policy, availability: policies.availability })).toThrow("thresholds");
  });
  it.each(["LEGACY_IMPORT", "PUBLIC_REFERENCE"] as const)("cannot promote %s even with timestamps", (kind) => {
    const offer = fixture(); offer.sourceKind = kind;
    expect(evaluate(offer)).toMatchObject({ priceFreshness: "UNKNOWN", availabilityFreshness: "UNKNOWN" });
  });
  it("never uses generic observation, ingestion or row timestamps as freshness fallback", () => {
    const offer = fixture(); offer.availability = null; offer.price!.observedAt = null;
    expect(evaluate(offer)).toMatchObject({ priceFreshness: "UNKNOWN", availabilityFreshness: "UNKNOWN" });
    const historical = { storedPrice: 41745, historicalSizeMarks: 3 };
    const external = { model: "EVIL TWIN +", season: "2025/2026", price: 45919, stock: "OUT_OF_STOCK" };
    offer.reconciliationStatus = "UNMATCHED"; offer.availabilityStatus = "OUT_OF_STOCK";
    offer.price!.amount = external.price;
    expect(projectMerchantOffer(offer, identity, NOW, policies).price.amount).toBeNull();
    expect(historical).toEqual({ storedPrice: 41745, historicalSizeMarks: 3 });
  });
  it.each(["rights", "product", "status", "reconciliation", "url", "evidence", "ingestion"])("missing/invalid %s evidence cannot become current", (field) => {
    const offer = fixture();
    if (field === "rights") offer.rightsEvidenceRef = " ";
    if (field === "product") offer.merchantProductId = null;
    if (field === "status") offer.sourceStatus = "INACTIVE";
    if (field === "reconciliation") offer.reconciliationStatus = "CONFLICT";
    if (field === "url") { offer.price!.sourceUrl = "javascript:bad"; offer.availability!.sourceUrl = "https://secret:pass@merchant.example"; }
    if (field === "evidence") { offer.price!.evidenceRef = null; offer.availability!.evidenceRef = null; }
    if (field === "ingestion") { offer.price!.ingestedAt = "2026-10-09T08:00:00Z"; offer.availability!.ingestedAt = null; }
    expect(evaluate(offer)).toMatchObject({ priceFreshness: "UNKNOWN", availabilityFreshness: "UNKNOWN", purchaseReady: false });
  });
  it("labels product price and never transfers product-level stock to a size", () => {
    const offer = fixture(); offer.price!.scope = "PRODUCT"; offer.availability!.scope = "PRODUCT";
    expect(evaluate(offer)).toMatchObject({ priceFreshness: "FRESH", availabilityFreshness: "UNKNOWN", purchaseReady: false });
    expect(projectMerchantOffer(offer, identity, NOW, policies).price.scopeLabel).toContain("не конкретной ростовки");
  });
  it.each(["boardId", "boardSlug", "sizeCm", "displaySizeLabel"] as const)("checks %s even when identity key is copied", (field) => {
    const offer = fixture(); offer.identity = { ...identity, [field]: field === "sizeCm" ? 159 : "other-season-or-size" };
    expect(evaluate(offer).reasonCodes).toContain("CANONICAL_SIZE_IDENTITY_MISMATCH");
  });
  it("blocks same-time price conflict but preserves non-conflicting stock evidence", () => {
    const a = fixture(); const b = fixture(); b.id = "offer-2"; b.price!.amount = 1;
    const [result] = reconcileMerchantObservations([a, b], NOW, policies);
    expect(result.price).toBeNull(); expect(result.availability).not.toBeNull();
    expect(result.conflictCodes).toEqual(["CONTRADICTORY_PRICE"]);
    const selected = selectCurrentExactSizeOffers([a, b], identity, NOW, policies);
    expect(selected.displayEligible).toHaveLength(1);
    expect(selected.displayEligible[0]).toMatchObject({ currentPriceEligible: false, purchaseReady: false });
    expect(selected.displayEligible[0].reasonCodes).toContain("CONTRADICTORY_PRICE");
  });
  it("blocks same-time stock conflict independently", () => {
    const a = fixture(); const b = fixture(); b.availabilityStatus = "OUT_OF_STOCK";
    const [result] = reconcileMerchantObservations([a, b], NOW, policies);
    expect(result.availability).toBeNull(); expect(result.price).not.toBeNull();
    expect(result.conflictCodes).toEqual(["CONTRADICTORY_AVAILABILITY"]);
  });
  it("uses later confirmed observations, not lowest price or ingestion order", () => {
    const older = fixture(); older.price!.amount = 1;
    const newer = fixture(); newer.price!.observedAt = "2026-10-09T11:45:00Z";
    newer.availability!.observedAt = "2026-10-09T11:59:30Z"; newer.availabilityStatus = "OUT_OF_STOCK";
    newer.price!.ingestedAt = "2026-10-09T11:50:00Z";
    const [result] = reconcileMerchantObservations([newer, older], NOW, policies);
    expect(result.price).toBe(newer); expect(result.availability).toBe(newer);
  });
  it("does not accept a later unverified price as a replacement", () => {
    const a = fixture(); const b = fixture(); b.price!.evidenceRef = null; b.price!.observedAt = NOW;
    expect(reconcileMerchantObservations([a, b], NOW, policies)[0].price).toBe(a);
  });
  it("partitions merchants, variants and seasons without currency conversion", () => {
    const a = fixture(); const b = fixture(); b.merchantSlug = "other"; b.price!.currency = "USD";
    const c = fixture(); c.merchantProductId = "other-season-product";
    c.identity = { ...identity, boardId: "other-season", identityKey: "other-key" };
    const d = fixture(); d.sourceIdentityKey = "sku:156W";
    expect(reconcileMerchantObservations([a, b, c, d], NOW, policies)).toHaveLength(4);
    b.merchantSlug = a.merchantSlug;
    expect(reconcileMerchantObservations([a, b], NOW, policies)[0].conflictCodes).toContain("CONTRADICTORY_PRICE");
  });
  it("prepares additive evidence fields without backfill or timestamp defaults", () => {
    const sql = readFileSync("db/migrations/20261009_040f_independent_merchant_observations.sql", "utf8");
    const schema = readFileSync("db/schema.sql", "utf8");
    expect(schema.replaceAll("\r\n", "\n")).toContain(sql.trim().replaceAll("\r\n", "\n"));
    expect(sql).not.toMatch(/\b(update\s+\w+\s+set|insert\s+into|delete\s+from|default\s+now|drop\s+)\b/iu);
    expect(sql).toContain("price_ingested_at >= price_observed_at");
    expect(sql).toContain("availability_ingested_at >= availability_observed_at");
  });
  it("keeps the merchant layer disconnected from public flow and scoring", () => {
    for (const path of ["src/lib/public-catalog-dto.ts", "src/lib/recommendation/engine.ts", "src/app/go/[slug]/route.ts"]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/merchant-offers|merchant-offer-presentation/u);
    }
    expect(projectMerchantOffer(fixture(), identity, NOW, policies).cta).toBe("Проверить в магазине");
  });
  it("blocks contradictory size or season mapping for the same source identity", () => {
    const a = fixture(); const b = fixture(); b.identity = { ...identity, boardId: "other-season" };
    expect(reconcileMerchantObservations([a, b], NOW, policies)[0]).toMatchObject({
      price: null, availability: null, conflictCodes: ["MULTIPLE_CANONICAL_SIZE_IDENTITIES"],
    });
  });
});
