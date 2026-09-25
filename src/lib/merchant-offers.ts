import { getBoardSizeLabel } from "@/lib/board-size";
import type {
  CanonicalCatalogItem,
  CanonicalSizeVariant,
} from "@/types/canonical-catalog";

export type MerchantStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN";
export type MerchantPartnerStatus = "NONE" | "NEGOTIATING" | "ACTIVE" | "PAUSED";
export type MerchantSourceKind =
  | "PARTNER_API"
  | "PARTNER_FEED"
  | "AFFILIATE_FEED"
  | "MANUAL_VERIFIED"
  | "LEGACY_IMPORT"
  | "PUBLIC_REFERENCE";
export type MerchantSourceStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN";
export type CommercialRightsStatus = "AUTHORIZED" | "UNKNOWN" | "RESTRICTED";
export type MerchantAvailabilityStatus =
  | "IN_STOCK"
  | "OUT_OF_STOCK"
  | "PREORDER"
  | "UNKNOWN";
export type OfferScope = "PRODUCT" | "EXACT_SIZE";
export type ReconciliationStatus = "MATCHED" | "UNMATCHED" | "CONFLICT";
export type FreshnessStatus = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

export interface CanonicalSizeIdentity {
  boardKind: "FAMILY" | "PRODUCT";
  boardId: string;
  boardSlug: string;
  sizeCm: number;
  displaySizeLabel: string;
  identityKey: string;
}

function normalizeCanonicalLabel(size: CanonicalSizeVariant) {
  const label = getBoardSizeLabel({
    sizeCm: size.sizeCm,
    sizeLabel: size.displaySizeLabel || size.sizeLabel,
  });
  const wideLabel = label.match(/^(\d+(?:[.,]\d+)?)w$/iu);
  return wideLabel ? `${wideLabel[1]}W` : label;
}

export function buildCanonicalSizeIdentity(
  item: CanonicalCatalogItem,
  size: CanonicalSizeVariant,
): CanonicalSizeIdentity {
  const boardKind = item.familyId ? "FAMILY" : "PRODUCT";
  const boardId = item.familyId?.trim() || size.offerId.trim();
  const boardSlug = item.slug.trim();
  const sizeCm = Number(size.sizeCm);
  const displaySizeLabel = normalizeCanonicalLabel(size);

  if (!boardId || !boardSlug || !Number.isFinite(sizeCm) || sizeCm <= 0) {
    throw new Error("Canonical size identity requires a canonical board and size.");
  }
  if (boardKind === "PRODUCT" && item.offers.length !== 1) {
    throw new Error("A singleton canonical size must belong to exactly one product.");
  }
  if (!item.offers.some((offer) => offer.offerId === size.offerId)) {
    throw new Error("Canonical size does not belong to the supplied catalog item.");
  }

  const normalizedBoardId = boardId.toLowerCase();
  const identityKey = JSON.stringify([
    "canonical-size-v1",
    boardKind,
    normalizedBoardId,
    sizeCm,
    displaySizeLabel,
  ]);

  return {
    boardKind,
    boardId: normalizedBoardId,
    boardSlug,
    sizeCm,
    displaySizeLabel,
    identityKey,
  };
}

export function buildMerchantOfferSourceIdentityKey(args: {
  merchantSizeSku?: string | null;
  canonicalSizeIdentity?: CanonicalSizeIdentity | null;
  normalizedSourceVariantKey?: string | null;
  sourceUrl?: string | null;
}) {
  const sku = args.merchantSizeSku?.trim().toLocaleUpperCase("en-US");
  if (sku) return `sku:${sku}`;

  const sourceVariant = args.normalizedSourceVariantKey?.trim();
  if (sourceVariant) return `variant:${sourceVariant}`;

  if (args.sourceUrl?.trim()) {
    try {
      const url = new URL(args.sourceUrl);
      for (const key of [...url.searchParams.keys()]) {
        const normalizedKey = key.toLowerCase();
        if (
          normalizedKey.startsWith("utm_") ||
          normalizedKey === "gclid" ||
          normalizedKey === "yclid" ||
          normalizedKey === "_openstat"
        ) {
          url.searchParams.delete(key);
        }
      }
      url.searchParams.sort();
      url.hash = "";
      return `url:${url.toString()}`;
    } catch {
      // An invalid source URL is not a stable fallback identity.
    }
  }

  if (args.canonicalSizeIdentity) {
    return `canonical-size:${args.canonicalSizeIdentity.identityKey}`;
  }

  throw new Error("Merchant offer source identity requires a stable key.");
}

export function normalizeAvailabilityStatus(value: unknown): MerchantAvailabilityStatus {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "IN_STOCK" ||
    normalized === "OUT_OF_STOCK" ||
    normalized === "PREORDER"
  ) {
    return normalized;
  }
  return "UNKNOWN";
}

export interface FreshnessPolicy {
  freshThroughMs: number;
  staleAfterMs: number;
}

function assertFreshnessPolicy(policy: FreshnessPolicy) {
  if (
    !Number.isFinite(policy.freshThroughMs) ||
    !Number.isFinite(policy.staleAfterMs) ||
    policy.freshThroughMs < 0 ||
    policy.staleAfterMs < policy.freshThroughMs
  ) {
    throw new Error("Freshness policy thresholds are invalid.");
  }
}

function timestampMs(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  return Date.parse(value);
}

export function classifyOfferFreshness(
  observedAt: string | Date | null | undefined,
  now: Date,
  policy: FreshnessPolicy,
): FreshnessStatus {
  assertFreshnessPolicy(policy);
  const observedAtMs = timestampMs(observedAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(nowMs) || observedAtMs > nowMs) {
    return "UNKNOWN";
  }

  const ageMs = nowMs - observedAtMs;
  if (ageMs <= policy.freshThroughMs) return "FRESH";
  if (ageMs <= policy.staleAfterMs) return "AGING";
  return "STALE";
}

export interface MerchantOfferPriceSnapshot {
  amount: number;
  currency: string;
  scope: OfferScope;
  observedAt: string | Date | null;
  feedGeneratedAt: string | Date | null;
  merchantUpdatedAt: string | Date | null;
  sourceReceivedAt: string | Date | null;
  sourceUrl: string;
}

export interface ExactSizeMerchantOfferSnapshot {
  id: string;
  merchantSlug: string;
  merchantStatus: MerchantStatus;
  sourceStatus: MerchantSourceStatus;
  sourceKind: MerchantSourceKind;
  commercialRightsStatus: CommercialRightsStatus;
  sourceIdentityKey: string;
  merchantSizeSku: string | null;
  identity: CanonicalSizeIdentity;
  availabilityStatus: MerchantAvailabilityStatus;
  merchantProductUrl: string;
  merchantSizeUrl: string | null;
  sourceUrl: string;
  feedVersion: string | null;
  checksum: string | null;
  /** Time claimed by the merchant's feed, if supplied. */
  feedGeneratedAt: string | Date | null;
  /** Merchant-provided update timestamp; never inferred from local row edits. */
  merchantUpdatedAt: string | Date | null;
  /** Time EdgeFit received the payload carrying this state. */
  sourceReceivedAt: string | Date | null;
  /** Successful observation time for this exact state; unrelated edits do not refresh it. */
  observedAt: string | Date | null;
  reconciliationStatus: ReconciliationStatus;
  reconciliationCodes: string[];
  price: MerchantOfferPriceSnapshot | null;
}

export interface EvaluatedMerchantOffer {
  offer: ExactSizeMerchantOfferSnapshot;
  eligible: boolean;
  reasonCodes: string[];
  availabilityFreshness: FreshnessStatus;
  priceFreshness: FreshnessStatus;
}

export function evaluateCurrentExactSizeOffer(
  offer: ExactSizeMerchantOfferSnapshot,
  requestedIdentity: CanonicalSizeIdentity,
  now: Date,
  policy: FreshnessPolicy,
): EvaluatedMerchantOffer {
  const reasonCodes: string[] = [];
  const availabilityFreshness = classifyOfferFreshness(offer.observedAt, now, policy);
  const priceFreshness = classifyOfferFreshness(offer.price?.observedAt, now, policy);

  if (offer.identity.identityKey !== requestedIdentity.identityKey) {
    reasonCodes.push("CANONICAL_SIZE_IDENTITY_MISMATCH");
  }
  if (offer.reconciliationStatus !== "MATCHED") {
    reasonCodes.push("RECONCILIATION_NOT_MATCHED");
  }
  if (offer.merchantStatus !== "ACTIVE") reasonCodes.push("MERCHANT_NOT_ACTIVE");
  if (offer.sourceStatus !== "ACTIVE") reasonCodes.push("SOURCE_NOT_ACTIVE");
  if (offer.commercialRightsStatus !== "AUTHORIZED") {
    reasonCodes.push("COMMERCIAL_RIGHTS_NOT_AUTHORIZED");
  }
  if (offer.sourceKind === "LEGACY_IMPORT") {
    reasonCodes.push("LEGACY_SOURCE_NOT_CURRENT_ELIGIBLE");
  }
  if (offer.availabilityStatus !== "IN_STOCK") {
    reasonCodes.push(`AVAILABILITY_${offer.availabilityStatus}`);
  }
  if (availabilityFreshness === "STALE" || availabilityFreshness === "UNKNOWN") {
    reasonCodes.push(`AVAILABILITY_${availabilityFreshness}`);
  }

  if (!offer.price) {
    reasonCodes.push("PRICE_MISSING");
  } else {
    if (!Number.isFinite(offer.price.amount) || offer.price.amount <= 0) {
      reasonCodes.push("PRICE_INVALID");
    }
    if (!/^[A-Z]{3}$/u.test(offer.price.currency)) reasonCodes.push("CURRENCY_INVALID");
    if (priceFreshness === "STALE" || priceFreshness === "UNKNOWN") {
      reasonCodes.push(`PRICE_${priceFreshness}`);
    }
  }

  return {
    offer,
    eligible: reasonCodes.length === 0,
    reasonCodes,
    availabilityFreshness,
    priceFreshness,
  };
}

export function selectCurrentExactSizeOffers(
  offers: readonly ExactSizeMerchantOfferSnapshot[],
  requestedIdentity: CanonicalSizeIdentity,
  now: Date,
  policy: FreshnessPolicy,
) {
  const evaluated = offers.map((offer) =>
    evaluateCurrentExactSizeOffer(offer, requestedIdentity, now, policy),
  );
  const eligible = evaluated
    .filter((entry) => entry.eligible)
    .sort(
      (left, right) =>
        left.offer.merchantSlug.localeCompare(right.offer.merchantSlug, "en") ||
        left.offer.id.localeCompare(right.offer.id, "en"),
    );

  return { evaluated, eligible };
}

export interface MerchantOfferReconciliationCandidate {
  sourceIdentityKey: string;
  canonicalSizeIdentity: CanonicalSizeIdentity | null;
  priceAmount: number | null;
  currency: string | null;
  availabilityStatus: MerchantAvailabilityStatus;
  observedAt: string | Date | null;
}

export function reconcileMerchantOfferCandidates(
  candidates: readonly MerchantOfferReconciliationCandidate[],
) {
  const conflictCodes = new Set<string>();
  const sourceIdentities = new Set(
    candidates.map((candidate) => candidate.sourceIdentityKey.trim()).filter(Boolean),
  );
  if (sourceIdentities.size > 1) conflictCodes.add("MIXED_SOURCE_IDENTITIES");
  const identities = new Set(
    candidates
      .map((candidate) => candidate.canonicalSizeIdentity?.identityKey)
      .filter((identity): identity is string => Boolean(identity)),
  );
  const hasUnmatched = candidates.some((candidate) => candidate.canonicalSizeIdentity == null);

  if (identities.size > 1) conflictCodes.add("MULTIPLE_CANONICAL_SIZE_IDENTITIES");
  if (identities.size > 0 && hasUnmatched) conflictCodes.add("PARTIAL_CANONICAL_SIZE_MAPPING");

  const knownAvailability = new Set(
    candidates
      .map((candidate) => candidate.availabilityStatus)
      .filter((status) => status !== "UNKNOWN"),
  );
  if (knownAvailability.size > 1) conflictCodes.add("CONTRADICTORY_AVAILABILITY");

  const knownPrices = new Set(
    candidates
      .filter((candidate) => candidate.priceAmount != null && candidate.currency)
      .map((candidate) => `${candidate.currency}:${candidate.priceAmount}`),
  );
  if (knownPrices.size > 1) conflictCodes.add("CONTRADICTORY_PRICE");

  if (conflictCodes.size > 0) {
    return {
      status: "CONFLICT" as const,
      canonicalSizeIdentity: null,
      conflictCodes: [...conflictCodes].sort(),
    };
  }

  if (identities.size === 0) {
    return {
      status: "UNMATCHED" as const,
      canonicalSizeIdentity: null,
      conflictCodes: [] as string[],
    };
  }

  return {
    status: "MATCHED" as const,
    canonicalSizeIdentity:
      candidates.find((candidate) => candidate.canonicalSizeIdentity)?.canonicalSizeIdentity ?? null,
    conflictCodes: [] as string[],
  };
}
