import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyOfferFreshness, evaluateCurrentExactSizeOffer, reconcileMerchantObservations, selectCurrentExactSizeOffers,
  type ExactSizeMerchantOfferSnapshot, type MerchantFreshnessPolicies, type MerchantAuthorityContext } from "./merchant-offers";
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
  return evaluateCurrentExactSizeOffer(offer, identity, NOW, policy, authorityFor(offer));
}

function authorityFor(offer = fixture()): MerchantAuthorityContext[] {
  return [{ basis: "CURRENT_TABLES", merchantSlug: offer.merchantSlug,
    merchantProductId: offer.merchantProductId!, merchantProductKey: offer.merchantProductKey!,
    merchantStatus: offer.merchantStatus, sourceStatus: offer.sourceStatus, sourceKind: offer.sourceKind,
    commercialRightsStatus: offer.commercialRightsStatus, rightsEvidenceRef: offer.rightsEvidenceRef ?? null }];
}

describe("independent merchant observation foundation", () => {
  it.each(["2026-02-30T12:00:00Z", "2025-02-29T12:00:00Z", "1900-02-29T12:00:00Z",
    "2026-04-31T12:00:00Z", "2026-13-01T12:00:00Z", "2026-00-01T12:00:00Z",
    "2026-10-00T12:00:00Z", "2026-10-09T24:00:00Z", "2026-10-09T11:60:00Z",
    "2026-10-09T11:59:60Z", "2026-10-09T11:00:00+24:00", "2026-10-09T11:00:00+00:60"])(
    "rejects impossible calendar/clock %s across classifier, evaluator and selector", (invalid) => {
      expect(classifyOfferFreshness(invalid, NOW, policies.price!)).toBe("UNKNOWN");
      const offer = fixture(); offer.price!.observedAt = invalid; offer.availability!.observedAt = invalid;
      expect(evaluate(offer)).toMatchObject({ priceFreshness: "UNKNOWN", availabilityFreshness: "UNKNOWN", purchaseReady: false });
      expect(selectCurrentExactSizeOffers([offer], identity, NOW, policies, authorityFor()).evaluated).toEqual([]);
    });
  it.each(["2024-02-29T12:00:00Z", "2000-02-29T12:00:00Z", "2026-10-09T13:59:00+02:00",
    "2026-10-09T08:29:00-03:30", "2026-10-09T11:59:00.123456Z", "2026-10-09T11:59Z"])(
    "preserves supported valid timestamp %s", (value) => {
      const clock = new Date(Date.parse(value) + 1000);
      expect(classifyOfferFreshness(value, clock, policies.price!)).toBe("FRESH");
      expect(classifyOfferFreshness(new Date(value), clock, policies.price!)).toBe("FRESH");
    });
  it("rejects invalid Date and future values throughout selection without fallback", () => {
    expect(classifyOfferFreshness(new Date(NaN), NOW, policies.price!)).toBe("UNKNOWN");
    const offer = fixture(); offer.price!.observedAt = new Date(NOW.getTime() + 1);
    offer.availability!.observedAt = new Date(NaN);
    expect(selectCurrentExactSizeOffers([offer], identity, NOW, policies, authorityFor()).evaluated).toEqual([]);
    offer.availability = fixture().availability;
    expect(evaluate(offer)).toMatchObject({ priceFreshness: "UNKNOWN", availabilityFreshness: "FRESH", purchaseReady: false });
  });
  it("cannot normalize February 30 into a fresh March observation", () => {
    const clock = new Date("2026-03-02T12:01:00Z");
    const offer = fixture();
    offer.price!.observedAt = "2026-02-30T12:00:00Z"; offer.price!.ingestedAt = clock;
    offer.availability!.observedAt = "2026-02-30T12:00:00Z"; offer.availability!.ingestedAt = clock;
    expect(evaluateCurrentExactSizeOffer(offer, identity, clock, policies, authorityFor())).toMatchObject({
      priceFreshness: "UNKNOWN", availabilityFreshness: "UNKNOWN", purchaseReady: false });
    expect(selectCurrentExactSizeOffers([offer], identity, clock, policies, authorityFor()).evaluated).toEqual([]);
  });
  it("requires explicit authority even for historically authorized fresh observations", () => {
    expect(evaluateCurrentExactSizeOffer(fixture(), identity, NOW, policies)).toMatchObject({
      priceFreshness: "FRESH", availabilityFreshness: "FRESH", currentPriceEligible: false, purchaseReady: false });
    expect(projectMerchantOffer(fixture(), identity, NOW, policies).availability).toMatchObject({
      status: "UNKNOWN", observedStatus: "IN_STOCK" });
  });
  it.each([
    { merchantStatus: "INACTIVE" as const }, { merchantStatus: "UNKNOWN" as const },
    { sourceStatus: "INACTIVE" as const }, { sourceStatus: "UNKNOWN" as const },
    { commercialRightsStatus: "RESTRICTED" as const }, { commercialRightsStatus: "UNKNOWN" as const },
    { rightsEvidenceRef: " " },
  ])("never resurrects old current stock after authority restriction %j", (restriction) => {
    const old = fixture(); const newer = fixture(); Object.assign(newer, restriction);
    newer.observedAt = NOW; newer.price!.observedAt = NOW; newer.availability!.observedAt = NOW;
    const authority = authorityFor(); Object.assign(authority[0], restriction);
    for (const observations of [[old, newer], [newer, old]]) {
      const selected = selectCurrentExactSizeOffers(observations, identity, NOW, policies, authority);
      expect(selected.evaluated).not.toHaveLength(0);
      expect(selected.evaluated.every((entry) => !entry.purchaseReady && !entry.currentAvailabilityEligible && !entry.currentPriceEligible)).toBe(true);
      expect(selected.evaluated[0].reasonCodes).toContain("CURRENT_AUTHORITY_NOT_CONFIRMED");
    }
    expect(old.availabilityStatus).toBe("IN_STOCK");
  });
  it("orders genuine authority events independently and permits evidenced restoration", () => {
    const event = (effectiveAt: string, sourceStatus: "ACTIVE" | "INACTIVE"): MerchantAuthorityContext => ({
      ...authorityFor()[0], basis: "VERIFIED_EVENT", effectiveAt, evidenceRef: "authority-event", sourceStatus });
    const active = event("2026-10-09T09:00:00Z", "ACTIVE");
    const revoked = event("2026-10-09T10:00:00Z", "INACTIVE");
    const restored = event("2026-10-09T11:00:00Z", "ACTIVE");
    const selected = (authority: MerchantAuthorityContext[]) => selectCurrentExactSizeOffers([fixture()], identity, NOW, policies, authority).evaluated[0];
    expect(selected([revoked, active]).purchaseReady).toBe(false);
    expect(selected([active, revoked]).purchaseReady).toBe(false);
    expect(selected([revoked, restored, active]).purchaseReady).toBe(true);
    expect(selected([restored, active, revoked]).purchaseReady).toBe(true);
    expect(selected([restored, { ...restored }]).purchaseReady).toBe(true);
    expect(selected([restored, event("2026-10-09T11:00:00Z", "INACTIVE")]).purchaseReady).toBe(false);
    expect(selected([restored, { ...event("2026-02-30T12:00:00Z", "ACTIVE") }]).purchaseReady).toBe(false);
    expect(selected([restored, { ...event("2026-10-09T11:00:00Z", "ACTIVE"), evidenceRef: "" }]).purchaseReady).toBe(false);
    expect(selected([restored, event("2026-10-10T11:00:00Z", "ACTIVE")]).purchaseReady).toBe(false);
    expect(selected([restored, authorityFor()[0]]).purchaseReady).toBe(false);
  });
  it("fails closed on contradictory current table reads, without blending merchants or sources", () => {
    const offer = fixture(); const current = authorityFor()[0];
    const otherSource = { ...current, merchantProductId: "product-2", sourceStatus: "INACTIVE" as const };
    const evaluateWith = (authority: MerchantAuthorityContext[]) => evaluateCurrentExactSizeOffer(offer, identity, NOW, policies, authority);
    expect(evaluateWith([current, otherSource]).purchaseReady).toBe(true);
    expect(evaluateWith([current, { ...otherSource, merchantStatus: "INACTIVE" }]).purchaseReady).toBe(false);
    expect(evaluateWith([current, { ...current, sourceStatus: "INACTIVE" }]).purchaseReady).toBe(false);
    expect(evaluateWith([current, { ...current, commercialRightsStatus: "UNKNOWN" }]).purchaseReady).toBe(false);
    expect(evaluateWith([current, { ...current, merchantSlug: "another", merchantStatus: "INACTIVE" }]).purchaseReady).toBe(true);
    expect(evaluateWith([{ ...current, merchantProductKey: "different" }]).purchaseReady).toBe(false);
    expect(evaluateWith([{ ...current, sourceKind: "LEGACY_IMPORT" }]).purchaseReady).toBe(false);
  });
  it("never combines independent source kinds into an authorized offer", () => {
    const manual = fixture(); manual.price = null;
    const feed = fixture(); feed.sourceKind = "PARTNER_FEED"; feed.availability = null;
    const authority = [...authorityFor(manual), ...authorityFor(feed)];
    authority[1].commercialRightsStatus = "RESTRICTED";
    const selected = selectCurrentExactSizeOffers([manual, feed], identity, NOW, policies, authority);
    expect(selected.evaluated).toHaveLength(2);
    expect(selected.evaluated.every((entry) => !entry.purchaseReady)).toBe(true);
    expect(selected.evaluated.find((entry) => entry.offer.sourceKind === "PARTNER_FEED")?.currentPriceEligible).toBe(false);
  });
  it.each([{ merchantStatus: "INACTIVE" as const }, { commercialRightsStatus: "RESTRICTED" as const },
    { commercialRightsStatus: "UNKNOWN" as const }])("requires newer evidenced restoration after %j", (restriction) => {
    const base = authorityFor()[0];
    const revoked: MerchantAuthorityContext = { ...base, ...restriction, basis: "VERIFIED_EVENT",
      effectiveAt: "2026-10-09T10:00:00Z", evidenceRef: "revoked" };
    const restored: MerchantAuthorityContext = { ...base, basis: "VERIFIED_EVENT",
      effectiveAt: "2026-10-09T11:00:00Z", evidenceRef: "restoration" };
    const evaluateWith = (events: MerchantAuthorityContext[]) => evaluateCurrentExactSizeOffer(fixture(), identity, NOW, policies, events);
    expect(evaluateWith([revoked]).purchaseReady).toBe(false);
    expect(evaluateWith([restored, revoked]).purchaseReady).toBe(true);
    expect(evaluateWith([revoked, { ...restored, effectiveAt: "2026-10-09T09:00:00Z" }]).purchaseReady).toBe(false);
  });
  it("documents atomic application, schema evidence and non-destructive recovery", () => {
    const doc = readFileSync("docs/merchant-observation-foundation.md", "utf8");
    expect(doc).toContain("--single-transaction");
    expect(doc).toContain("ON_ERROR_STOP=1");
    for (const term of ["Preflight", "Postflight", "Partial application", "UNKNOWN", "pg_get_constraintdef", "pg_indexes"])
      expect(doc).toContain(term);
  });
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
