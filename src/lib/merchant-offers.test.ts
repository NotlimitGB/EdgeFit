import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "postgres";
import type { CanonicalCatalogItem, CanonicalSizeVariant } from "@/types/canonical-catalog";

vi.mock("server-only", () => ({}));

const databaseMocks = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  getClient: vi.fn(),
  query: vi.fn(async (...args: unknown[]): Promise<unknown[]> => {
    void args;
    return [];
  }),
}));

vi.mock("@/lib/database/config", () => ({
  базаНастроена: databaseMocks.configured,
}));
vi.mock("@/lib/database/client", () => ({
  получитьКлиентБазы: databaseMocks.getClient,
}));

import {
  buildCanonicalSizeIdentity,
  buildMerchantOfferSourceIdentityKey,
  classifyOfferFreshness,
  evaluateCurrentExactSizeOffer as evaluateWithoutAuthority,
  normalizeAvailabilityStatus,
  reconcileMerchantOfferCandidates,
  selectCurrentExactSizeOffers as selectWithoutAuthority,
  type MerchantAuthorityContext,
  type ExactSizeMerchantOfferSnapshot,
  type MerchantOfferReconciliationCandidate,
} from "@/lib/merchant-offers";
import { getMerchantOffersForCanonicalSize } from "@/lib/merchant-offers.server";
import { ALGORITHM_VERSION } from "@/lib/recommendation/engine";

const FAMILY_ID = "3a90a4b3-907e-478a-8987-6ba19f6c87a1";
const BASE_OFFER_ID = "a68f7552-5301-4e8f-ac3b-58d1e2764ab1";
const WIDE_OFFER_ID = "93415852-0c09-47fa-8e45-5d739abc1018";
const NOW = new Date("2026-09-25T12:00:00.000Z");
const METRIC_POLICY = { version: "fixture-only-v1", freshThroughMs: 6 * 60 * 60 * 1000, staleAfterMs: 24 * 60 * 60 * 1000 };
const POLICY = { price: METRIC_POLICY, availability: METRIC_POLICY };

function authorityFor(offers: readonly ExactSizeMerchantOfferSnapshot[]): MerchantAuthorityContext[] {
  return offers.map((offer) => ({ basis: "CURRENT_TABLES", merchantSlug: offer.merchantSlug,
    merchantProductId: offer.merchantProductId!, merchantProductKey: offer.merchantProductKey!,
    merchantStatus: offer.merchantStatus, sourceStatus: offer.sourceStatus, sourceKind: offer.sourceKind,
    commercialRightsStatus: offer.commercialRightsStatus, rightsEvidenceRef: offer.rightsEvidenceRef ?? null }));
}
// Explicit fixture-only current table evidence; production never derives authority from observations.
const evaluateCurrentExactSizeOffer = (...args: Parameters<typeof evaluateWithoutAuthority>) =>
  evaluateWithoutAuthority(args[0], args[1], args[2], args[3], args[4] ?? authorityFor([args[0]]));
const selectCurrentExactSizeOffers = (...args: Parameters<typeof selectWithoutAuthority>) =>
  selectWithoutAuthority(args[0], args[1], args[2], args[3], args[4] ?? authorityFor(args[0]));

function canonicalSize(overrides: Partial<CanonicalSizeVariant> = {}): CanonicalSizeVariant {
  const displaySizeLabel = overrides.displaySizeLabel ?? "159";
  const isWide = displaySizeLabel.endsWith("W");
  return {
    sourceSizeId: "source-size-159",
    offerId: isWide ? WIDE_OFFER_ID : BASE_OFFER_ID,
    offerSlug: isWide ? "drake-league-wide" : "drake-league-base",
    memberRole: isWide ? "wide" : "base",
    offerIsActive: true,
    rawSizeLabel: displaySizeLabel,
    displaySizeLabel,
    sizeLabel: displaySizeLabel,
    sizeCm: 159,
    waistWidthMm: isWide ? 263 : 255,
    recommendedWeightMin: 60,
    recommendedWeightMax: 85,
    widthType: isWide ? "wide" : "regular",
    isAvailable: true,
    ...overrides,
  };
}

function canonicalItem(overrides: Partial<CanonicalCatalogItem> = {}): CanonicalCatalogItem {
  const sizes = [canonicalSize(), canonicalSize({
    sourceSizeId: "source-size-159-wide",
    displaySizeLabel: "159W",
    sizeLabel: "159W",
    rawSizeLabel: "159 W",
    offerId: WIDE_OFFER_ID,
    offerSlug: "drake-league-wide",
    memberRole: "wide",
    widthType: "wide",
    waistWidthMm: 263,
  })];
  return {
    familyId: FAMILY_ID,
    slug: "drake-league-2021-2022",
    brand: "Drake",
    modelName: "League",
    seasonLabel: "2021/2022",
    canonicalSpecs: {
      descriptionShort: null,
      descriptionFull: null,
      ridingStyle: null,
      skillLevel: null,
      flex: null,
      boardLine: null,
      shapeType: null,
      camberProfile: null,
      dataStatus: "draft",
      canonicalSourceKind: null,
      sourceName: null,
      sourceUrl: null,
      sourceCheckedAt: null,
    },
    offers: [
      {
        offerId: BASE_OFFER_ID,
        offerSlug: "drake-league-base",
        memberRole: "base",
        familyMatchMethod: "audit-high-v1",
        familyMatchConfidence: "high",
        familyManualOverride: false,
        priceFrom: 0,
        isActive: true,
        hasAvailableSize: true,
        isFulfillable: true,
        sourceName: null,
        sourceUrl: null,
        sourceCheckedAt: null,
        dataStatus: "draft",
      },
      {
        offerId: WIDE_OFFER_ID,
        offerSlug: "drake-league-wide",
        memberRole: "wide",
        familyMatchMethod: "audit-high-v1",
        familyMatchConfidence: "high",
        familyManualOverride: false,
        priceFrom: 0,
        isActive: true,
        hasAvailableSize: true,
        isFulfillable: true,
        sourceName: null,
        sourceUrl: null,
        sourceCheckedAt: null,
        dataStatus: "draft",
      },
    ],
    sizes,
    priceFrom: null,
    isActive: true,
    hasAvailableSize: true,
    media: [],
    defaultOfferSlug: "drake-league-base",
    ...overrides,
  };
}

const drake = canonicalItem();
const regular159 = buildCanonicalSizeIdentity(drake, drake.sizes[0]!);
const wide159 = buildCanonicalSizeIdentity(drake, drake.sizes[1]!);

function offer(
  identity = regular159,
  overrides: Partial<ExactSizeMerchantOfferSnapshot> = {},
): ExactSizeMerchantOfferSnapshot {
  return {
    id: "offer-a-159",
    merchantSlug: "merchant-a",
    merchantStatus: "ACTIVE",
    sourceStatus: "ACTIVE",
    sourceKind: "PARTNER_FEED",
    commercialRightsStatus: "AUTHORIZED",
    rightsEvidenceRef: "fixture-permission",
    merchantProductId: "merchant-product-a",
    merchantProductKey: "source-product-a",
    sourceIdentityKey: `sku:${identity.displaySizeLabel}`,
    merchantSizeSku: identity.displaySizeLabel,
    identity,
    availabilityStatus: "IN_STOCK",
    availability: { scope: "EXACT_SIZE", observedAt: new Date("2026-09-25T11:30:00.000Z"),
      ingestedAt: NOW, merchantUpdatedAt: null, evidenceRef: "fixture-stock",
      sourceUrl: "https://merchant.example/stock" },
    merchantProductUrl: "https://merchant.example/board",
    merchantSizeUrl: null,
    sourceUrl: "https://merchant.example/feed/board",
    feedVersion: "v1",
    checksum: "sha256:abc",
    feedGeneratedAt: new Date("2026-09-25T10:00:00.000Z"),
    merchantUpdatedAt: new Date("2026-09-25T10:30:00.000Z"),
    sourceReceivedAt: new Date("2026-09-25T11:00:00.000Z"),
    observedAt: new Date("2026-09-25T11:30:00.000Z"),
    reconciliationStatus: "MATCHED",
    reconciliationCodes: [],
    price: {
      amount: 49_990,
      currency: "RUB",
      scope: "EXACT_SIZE",
      evidenceRef: "fixture-price",
      ingestedAt: NOW,
      observedAt: new Date("2026-09-25T11:30:00.000Z"),
      feedGeneratedAt: new Date("2026-09-25T10:00:00.000Z"),
      merchantUpdatedAt: new Date("2026-09-25T10:30:00.000Z"),
      sourceReceivedAt: new Date("2026-09-25T11:00:00.000Z"),
      sourceUrl: "https://merchant.example/feed/board-size",
    },
    ...overrides,
  };
}

function reconciliationCandidate(
  identity: typeof regular159 | null,
  overrides: Partial<MerchantOfferReconciliationCandidate> = {},
): MerchantOfferReconciliationCandidate {
  return {
    sourceIdentityKey: "sku:159",
    canonicalSizeIdentity: identity,
    priceAmount: 49_990,
    currency: "RUB",
    availabilityStatus: "IN_STOCK",
    observedAt: NOW,
    ...overrides,
  };
}

describe("merchant offer contract", () => {
  beforeEach(() => {
    databaseMocks.configured.mockReturnValue(true);
    databaseMocks.query.mockReset();
    databaseMocks.getClient.mockReturnValue(databaseMocks.query);
  });

  it("keeps Drake 159 and 159W as distinct canonical identities", () => {
    expect(regular159.identityKey).not.toBe(wide159.identityKey);
    expect(regular159).toMatchObject({ sizeCm: 159, displaySizeLabel: "159" });
    expect(wide159).toMatchObject({ sizeCm: 159, displaySizeLabel: "159W" });

    const sameIdentityFromAnotherFamilyMember = buildCanonicalSizeIdentity(
      drake,
      canonicalSize({
        sourceSizeId: "different-source-row",
        offerId: BASE_OFFER_ID,
        displaySizeLabel: "159 cm",
        sizeLabel: "159 cm",
      }),
    );
    expect(sameIdentityFromAnotherFamilyMember.identityKey).toBe(regular159.identityKey);
    expect(sameIdentityFromAnotherFamilyMember).not.toHaveProperty("sourceSizeId");
  });

  it("selects offers from multiple merchants for the same exact size", () => {
    const result = selectCurrentExactSizeOffers(
      [
        offer(regular159, { id: "offer-b", merchantSlug: "merchant-b" }),
        offer(regular159, { id: "offer-a", merchantSlug: "merchant-a" }),
      ],
      regular159,
      NOW,
      POLICY,
    );
    expect(result.displayEligible.map((entry) => entry.offer.merchantSlug)).toEqual([
      "merchant-a",
      "merchant-b",
    ]);
  });

  it("keeps one merchant's regular and Wide size offers separate", () => {
    const result = selectCurrentExactSizeOffers(
      [offer(wide159, { id: "wide" }), offer(regular159, { id: "regular" })],
      wide159,
      NOW,
      POLICY,
    );
    expect(result.displayEligible.map((entry) => entry.offer.id)).toEqual(["wide"]);
  });

  it("preserves explicit availability and maps missing or unrecognized values to UNKNOWN", () => {
    expect(normalizeAvailabilityStatus(undefined)).toBe("UNKNOWN");
    expect(normalizeAvailabilityStatus("on the way")).toBe("UNKNOWN");
    expect(normalizeAvailabilityStatus("OUT_OF_STOCK")).toBe("OUT_OF_STOCK");
    expect(
      evaluateCurrentExactSizeOffer(
        offer(regular159, { availabilityStatus: "OUT_OF_STOCK" }),
        regular159,
        NOW,
        POLICY,
      ).displayEligible,
    ).toBe(true);
    expect(
      evaluateCurrentExactSizeOffer(
        offer(regular159, { availabilityStatus: "UNKNOWN" }),
        regular159,
        NOW,
        POLICY,
      ).reasonCodes,
    ).toContain("AVAILABILITY_UNKNOWN");
  });

  it("separates display eligibility from a fresh current-availability claim", () => {
    expect(classifyOfferFreshness(null, NOW, METRIC_POLICY)).toBe("UNKNOWN");
    expect(classifyOfferFreshness(new Date("2026-09-24T11:00:00.000Z"), NOW, METRIC_POLICY)).toBe("STALE");
    expect(classifyOfferFreshness(new Date("2026-09-25T06:00:01.000Z"), NOW, METRIC_POLICY)).toBe("FRESH");
    expect(classifyOfferFreshness(new Date("2026-09-25T04:00:00.000Z"), NOW, METRIC_POLICY)).toBe("AGING");
    const fresh = evaluateCurrentExactSizeOffer(offer(), regular159, NOW, POLICY);
    expect(fresh).toMatchObject({
      displayEligible: true,
      currentAvailabilityEligible: true,
      availabilityFreshness: "FRESH",
      priceFreshness: "FRESH",
    });

    const agingAvailability = evaluateCurrentExactSizeOffer(
      offer(regular159, { availability: { ...offer().availability!, observedAt: new Date("2026-09-25T04:00:00.000Z") } }),
      regular159,
      NOW,
      POLICY,
    );
    expect(agingAvailability).toMatchObject({
      displayEligible: true,
      currentAvailabilityEligible: false,
      availabilityFreshness: "AGING",
    });

    const agingPrice = evaluateCurrentExactSizeOffer(
      offer(regular159, {
        price: { ...offer().price!, observedAt: new Date("2026-09-25T04:00:00.000Z") },
      }),
      regular159,
      NOW,
      POLICY,
    );
    expect(agingPrice).toMatchObject({
      displayEligible: true,
      currentAvailabilityEligible: true,
      priceFreshness: "AGING",
    });

    for (const observedAt of [null, new Date("2026-09-24T11:00:00.000Z")]) {
      const unavailable = evaluateCurrentExactSizeOffer(
        offer(regular159, { availability: { ...offer().availability!, observedAt } }),
        regular159,
        NOW,
        POLICY,
      );
      expect(unavailable.displayEligible).toBe(true);
      expect(unavailable.currentAvailabilityEligible).toBe(false);
    }

    const unknownPrice = evaluateCurrentExactSizeOffer(
      offer(regular159, {
        price: { ...offer().price!, observedAt: null },
      }),
      regular159,
      NOW,
      POLICY,
    );
    expect(unknownPrice.reasonCodes).toContain("PRICE_UNKNOWN");
    expect(unknownPrice.displayEligible).toBe(true);
    expect(unknownPrice.currentAvailabilityEligible).toBe(true);
    expect(unknownPrice.purchaseReady).toBe(false);
  });

  it("does not turn legacy imports, unauthorized sources, or price alone into current offers", () => {
    for (const overrides of [
      { sourceKind: "LEGACY_IMPORT" as const },
      { commercialRightsStatus: "UNKNOWN" as const },
      { sourceStatus: "UNKNOWN" as const },
      { merchantStatus: "INACTIVE" as const },
    ]) {
      expect(
        evaluateCurrentExactSizeOffer(offer(regular159, overrides), regular159, NOW, POLICY)
          .displayEligible,
      ).toBe(false);
    }
  });

  it("uses a stable SKU before URLs, so tracking parameters cannot duplicate source identity", () => {
    const first = buildMerchantOfferSourceIdentityKey({
      merchantSizeSku: " drake-159 ",
      sizeSpecificSourceUrl: "https://merchant.example/board/159?utm_source=one",
    });
    const second = buildMerchantOfferSourceIdentityKey({
      merchantSizeSku: "DRAKE-159",
      sizeSpecificSourceUrl: "https://merchant.example/board/159?utm_source=two&gclid=abc",
    });
    expect(first).toBe("sku:DRAKE-159");
    expect(second).toBe(first);
    expect(
      buildMerchantOfferSourceIdentityKey({
        normalizedSourceVariantKey: "wide-159",
      }),
    ).toBe("variant:wide-159");
    expect(
      buildMerchantOfferSourceIdentityKey({
        sizeSpecificSourceUrl: "https://merchant.example/board/159W?utm_source=one&color=black#size",
      }),
    ).toBe("url:https://merchant.example/board/159W?color=black");

    expect(() =>
      buildMerchantOfferSourceIdentityKey({
        canonicalSizeIdentity: regular159,
      } as Parameters<typeof buildMerchantOfferSourceIdentityKey>[0]),
    ).toThrow("Merchant offer source identity requires a stable key.");

    expect(() =>
      buildMerchantOfferSourceIdentityKey({
        canonicalSizeIdentity: regular159,
        sourceUrl: "https://merchant.example/product",
      } as Parameters<typeof buildMerchantOfferSourceIdentityKey>[0]),
    ).toThrow("Merchant offer source identity requires a stable key.");
  });

  it("keeps model/edition identities distinct even when numeric size is equal", () => {
    const laterSeason = canonicalItem({
      familyId: "c75a4040-cfa0-41e1-ae6c-9ef1522c8f49",
      slug: "drake-league-2022-2023",
    });
    const laterIdentity = buildCanonicalSizeIdentity(laterSeason, laterSeason.sizes[0]!);
    expect(laterIdentity.sizeCm).toBe(regular159.sizeCm);
    expect(laterIdentity.identityKey).not.toBe(regular159.identityKey);
  });

  it("keeps price and the four source timestamps on commerce observations, not canonical truth", () => {
    const observed = offer();
    expect(observed.price).toMatchObject({ amount: 49_990, scope: "EXACT_SIZE", currency: "RUB" });
    expect(observed).toMatchObject({
      feedGeneratedAt: new Date("2026-09-25T10:00:00.000Z"),
      merchantUpdatedAt: new Date("2026-09-25T10:30:00.000Z"),
      sourceReceivedAt: new Date("2026-09-25T11:00:00.000Z"),
      observedAt: new Date("2026-09-25T11:30:00.000Z"),
    });
    expect(regular159).not.toHaveProperty("price");
    expect(regular159).not.toHaveProperty("availabilityStatus");
  });

  it("returns conflict diagnostics instead of choosing contradictory source evidence", () => {
    const conflict = reconcileMerchantOfferCandidates([
      reconciliationCandidate(regular159),
      reconciliationCandidate(wide159),
    ]);
    expect(conflict).toMatchObject({
      status: "CONFLICT",
      canonicalSizeIdentity: null,
      conflictCodes: ["MULTIPLE_CANONICAL_SIZE_IDENTITIES"],
    });

    const mixedSourceIdentity = reconcileMerchantOfferCandidates([
      reconciliationCandidate(regular159),
      reconciliationCandidate(regular159, { sourceIdentityKey: "sku:another" }),
    ]);
    expect(mixedSourceIdentity.conflictCodes).toContain("MIXED_SOURCE_IDENTITIES");

    const contradictoryAvailability = reconcileMerchantOfferCandidates([
      reconciliationCandidate(regular159),
      reconciliationCandidate(regular159, { availabilityStatus: "OUT_OF_STOCK" }),
    ]);
    expect(contradictoryAvailability.conflictCodes).toContain("CONTRADICTORY_AVAILABILITY");

    const contradictoryPrice = reconcileMerchantOfferCandidates([
      reconciliationCandidate(regular159),
      reconciliationCandidate(regular159, { priceAmount: 52_990 }),
    ]);
    expect(contradictoryPrice.conflictCodes).toContain("CONTRADICTORY_PRICE");
  });

  it("does not treat affiliate economics or user-profile data as offer or fit inputs", () => {
    const offerKeys = Object.keys(offer());
    for (const forbidden of [
      "session_id", "sessionId", "email", "height", "weight", "bootSize", "stance",
      "skill", "ridingPreferences", "savedResultToken", "analyticsId", "affiliateCommission",
    ]) {
      expect(offerKeys).not.toContain(forbidden);
    }
    expect(ALGORITHM_VERSION).toBe("v1.6.4");
    const engineSource = readFileSync(join(process.cwd(), "src", "lib", "recommendation", "engine.ts"), "utf8");
    expect(engineSource).not.toMatch(/merchant[_-]offers|affiliateCommission/iu);
  });

  it("supports the required isolated Jones multi-store fixture", () => {
    const jones = canonicalItem({
      familyId: "a4be96c8-2d79-4f41-ae23-1538707361fe",
      slug: "jones-example-board",
      brand: "Jones",
      modelName: "Example Board",
      sizes: [canonicalSize({ displaySizeLabel: "159", sizeLabel: "159", memberRole: "base" }), canonicalSize({
        sourceSizeId: "jones-wide-source",
        displaySizeLabel: "159W",
        sizeLabel: "159W",
        offerId: WIDE_OFFER_ID,
        memberRole: "wide",
        widthType: "wide",
      })],
    });
    const jones159 = buildCanonicalSizeIdentity(jones, jones.sizes[0]!);
    const jones159W = buildCanonicalSizeIdentity(jones, jones.sizes[1]!);
    const fixtureOffers = [
      offer(jones159, { id: "a-159", merchantSlug: "merchant-a", price: { ...offer().price!, amount: 49_990 } }),
      offer(jones159W, { id: "a-159w", merchantSlug: "merchant-a", sourceIdentityKey: "sku:A-159W", merchantSizeSku: "A-159W", price: { ...offer().price!, amount: 52_990 } }),
      offer(jones159, { id: "b-159", merchantSlug: "merchant-b", sourceIdentityKey: "sku:B-159", merchantSizeSku: "B-159", price: { ...offer().price!, amount: 48_990 } }),
      offer(jones159W, { id: "b-159w", merchantSlug: "merchant-b", sourceIdentityKey: "sku:B-159W", merchantSizeSku: "B-159W", availabilityStatus: "OUT_OF_STOCK" }),
    ];
    expect(selectCurrentExactSizeOffers(fixtureOffers, jones159, NOW, POLICY).displayEligible.map((entry) => entry.offer.id).sort()).toEqual(["a-159", "b-159"]);
    expect(selectCurrentExactSizeOffers(fixtureOffers, jones159W, NOW, POLICY).displayEligible.map((entry) => entry.offer.id)).toEqual(["a-159w", "b-159w"]);
    expect(selectCurrentExactSizeOffers(fixtureOffers, jones159W, NOW, POLICY).currentAvailabilityEligible.map((entry) => entry.offer.id)).toEqual(["a-159w", "b-159w"]);
    expect(selectCurrentExactSizeOffers(fixtureOffers, jones159W, NOW, POLICY).displayEligible.filter((entry) => entry.purchaseReady).map((entry) => entry.offer.id)).toEqual(["a-159w"]);
    expect(fixtureOffers.find((entry) => entry.id === "b-159w")?.availabilityStatus).toBe("OUT_OF_STOCK");
  });

  it("loads exact-size matches and preserves product-level price provenance separately", async () => {
    const row = {
      id: "db-offer",
      merchantProductId: "product-fixture",
      merchantProductKey: "source-fixture",
      rightsEvidenceRef: "permission-fixture",
      availabilityObservedAt: new Date("2026-09-25T09:30:00.000Z"),
      availabilityEvidenceRef: "stock-fixture",
      availabilityIngestedAt: NOW,
      availabilityMerchantUpdatedAt: null,
      availabilitySourceUrl: "https://merchant.example/stock-evidence",
      priceEvidenceRef: "price-fixture",
      merchantSlug: "merchant-a",
      merchantStatus: "ACTIVE",
      sourceStatus: "ACTIVE",
      sourceKind: "PARTNER_FEED",
      commercialRightsStatus: "AUTHORIZED",
      sourceIdentityKey: "sku:159",
      merchantSizeSku: "159",
      canonicalBoardKind: regular159.boardKind,
      canonicalBoardId: regular159.boardId,
      canonicalBoardSlug: regular159.boardSlug,
      canonicalSizeIdentityKey: regular159.identityKey,
      canonicalSizeCm: 159,
      displaySizeLabel: "159",
      availabilityStatus: "IN_STOCK",
      merchantProductUrl: "https://merchant.example/board",
      merchantSizeUrl: null,
      sourceUrl: "https://merchant.example/stock-feed",
      feedVersion: "sizes-3",
      checksum: null,
      feedGeneratedAt: new Date("2026-09-25T08:00:00.000Z"),
      merchantUpdatedAt: new Date("2026-09-25T08:30:00.000Z"),
      sourceReceivedAt: new Date("2026-09-25T09:00:00.000Z"),
      observedAt: new Date("2026-09-25T09:30:00.000Z"),
      reconciliationStatus: "MATCHED",
      reconciliationCodes: [],
      priceAmount: 49_990,
      currency: "RUB ",
      priceScope: "PRODUCT",
      priceObservedAt: new Date("2026-09-25T07:00:00.000Z"),
      priceFeedGeneratedAt: new Date("2026-09-25T06:00:00.000Z"),
      priceMerchantUpdatedAt: new Date("2026-09-25T06:30:00.000Z"),
      priceSourceReceivedAt: new Date("2026-09-25T06:45:00.000Z"),
      priceSourceUrl: "https://merchant.example/product-feed",
    };
    databaseMocks.query.mockResolvedValue([row]);

    const loaded = await getMerchantOffersForCanonicalSize(
      regular159,
      databaseMocks.query as unknown as Sql,
    );
    const result = loaded.offers;
    expect(loaded.authority).toEqual([expect.objectContaining({ basis: "CURRENT_TABLES",
      merchantSlug: row.merchantSlug, merchantStatus: row.merchantStatus,
      sourceStatus: row.sourceStatus, rightsEvidenceRef: row.rightsEvidenceRef })]);
    expect(loaded.authority[0]).not.toHaveProperty("effectiveAt");
    expect(result).toHaveLength(1);
    expect(result[0]?.price).toMatchObject({
      amount: 49_990,
      currency: "RUB",
      scope: "PRODUCT",
      observedAt: row.priceObservedAt,
      sourceUrl: "https://merchant.example/product-feed",
    });
    expect(result[0]?.observedAt).toBe(row.observedAt);
    expect(result[0]?.availability).toMatchObject({
      scope: "EXACT_SIZE", observedAt: row.availabilityObservedAt,
      evidenceRef: row.availabilityEvidenceRef, ingestedAt: NOW,
    });
    expect(result[0]?.price?.evidenceRef).toBe(row.priceEvidenceRef);
    expect(result[0]?.merchantProductKey).toBe(row.merchantProductKey);
    const queryCall = databaseMocks.query.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(queryCall[0].join(" ")).toContain("reconciliation_status = 'MATCHED'");
    expect(queryCall[0].join(" ")).toContain("offer.price_observed_at else product_offer.price_observed_at");
    expect(queryCall[0].join(" ")).not.toContain('then offer.observed_at else product_offer.observed_at');
    expect(queryCall.slice(1)).toContain(regular159.identityKey);
    for (const restriction of [{ merchantStatus: "INACTIVE" }, { sourceStatus: "INACTIVE" },
      { commercialRightsStatus: "RESTRICTED" }, { commercialRightsStatus: "UNKNOWN" }]) {
      databaseMocks.query.mockResolvedValue([{ ...row, ...restriction }]);
      const restricted = await getMerchantOffersForCanonicalSize(regular159, databaseMocks.query as unknown as Sql);
      expect(restricted.authority[0]).toMatchObject(restriction);
      expect(selectWithoutAuthority(restricted.offers, regular159, NOW, POLICY, restricted.authority)
        .evaluated.every((entry) => !entry.purchaseReady)).toBe(true);
    }
  });

  it("does not open a database connection when database configuration is absent", async () => {
    databaseMocks.configured.mockReturnValue(false);
    databaseMocks.getClient.mockClear();
    await expect(getMerchantOffersForCanonicalSize(regular159)).resolves.toEqual({ offers: [], authority: [] });
    expect(databaseMocks.getClient).not.toHaveBeenCalled();
  });
});
