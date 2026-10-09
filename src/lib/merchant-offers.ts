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
  normalizedSourceVariantKey?: string | null;
  sizeSpecificSourceUrl?: string | null;
}) {
  const sku = args.merchantSizeSku?.trim().toLocaleUpperCase("en-US");
  if (sku) return `sku:${sku}`;

  const sourceVariant = args.normalizedSourceVariantKey?.trim();
  if (sourceVariant) return `variant:${sourceVariant}`;

  if (args.sizeSpecificSourceUrl?.trim()) {
    try {
      const url = new URL(args.sizeSpecificSourceUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
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
      }
    } catch {
      // An invalid source URL is not a stable fallback identity.
    }
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
  version: string;
  freshThroughMs: number;
  staleAfterMs: number;
}

function assertFreshnessPolicy(policy: FreshnessPolicy) {
  if (
    !policy.version?.trim() ||
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
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return Number.NaN;
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
  evidenceRef?: string | null;
  ingestedAt?: string | Date | null;
}

export interface MerchantAvailabilityObservation {
  scope: OfferScope;
  observedAt: string | Date | null;
  evidenceRef: string | null;
  sourceUrl: string;
  merchantUpdatedAt: string | Date | null;
  ingestedAt: string | Date | null;
}

/** No production default: source cadence and authorization must be agreed first. */
export interface MerchantFreshnessPolicies {
  price: FreshnessPolicy | null;
  availability: FreshnessPolicy | null;
}

function publicSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function metricFreshness(
  metric: { observedAt: string | Date | null; ingestedAt: string | Date | null;
    evidenceRef: string | null; sourceUrl: string } | null | undefined,
  now: Date, policy: FreshnessPolicy | null, eligible: boolean,
): FreshnessStatus {
  if (policy) assertFreshnessPolicy(policy);
  if (!policy || !eligible || !metric?.evidenceRef?.trim() || !publicSourceUrl(metric.sourceUrl))
    return "UNKNOWN";
  const observed = timestampMs(metric.observedAt);
  const ingested = timestampMs(metric.ingestedAt);
  if (!Number.isFinite(ingested) || ingested < observed || ingested > now.getTime()) return "UNKNOWN";
  return classifyOfferFreshness(metric.observedAt, now, policy);
}

export interface ExactSizeMerchantOfferSnapshot {
  id: string;
  merchantSlug: string;
  merchantStatus: MerchantStatus;
  sourceStatus: MerchantSourceStatus;
  sourceKind: MerchantSourceKind;
  commercialRightsStatus: CommercialRightsStatus;
  rightsEvidenceRef?: string | null;
  merchantProductId?: string | null;
  merchantProductKey?: string | null;
  sourceIdentityKey: string;
  merchantSizeSku: string | null;
  identity: CanonicalSizeIdentity;
  availabilityStatus: MerchantAvailabilityStatus;
  availability?: MerchantAvailabilityObservation | null;
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
  /** Passes display checks; AGING is allowed within the caller-supplied policy. */
  displayEligible: boolean;
  /** Display-eligible with a FRESH availability observation, not merely AGING. */
  currentAvailabilityEligible: boolean;
  currentPriceEligible: boolean;
  purchaseReady: boolean;
  reasonCodes: string[];
  availabilityFreshness: FreshnessStatus;
  priceFreshness: FreshnessStatus;
}

export function evaluateCurrentExactSizeOffer(
  offer: ExactSizeMerchantOfferSnapshot,
  requestedIdentity: CanonicalSizeIdentity,
  now: Date,
  policies: MerchantFreshnessPolicies | null,
): EvaluatedMerchantOffer {
  const reasonCodes: string[] = [];
  if ((Object.keys(requestedIdentity) as (keyof CanonicalSizeIdentity)[])
    .some((key) => offer.identity[key] !== requestedIdentity[key])) {
    reasonCodes.push("CANONICAL_SIZE_IDENTITY_MISMATCH");
  }
  if (offer.reconciliationStatus !== "MATCHED" || offer.reconciliationCodes.length > 0) {
    reasonCodes.push("RECONCILIATION_NOT_MATCHED");
  }
  if (offer.merchantStatus !== "ACTIVE") reasonCodes.push("MERCHANT_NOT_ACTIVE");
  if (offer.sourceStatus !== "ACTIVE") reasonCodes.push("SOURCE_NOT_ACTIVE");
  if (offer.commercialRightsStatus !== "AUTHORIZED") {
    reasonCodes.push("COMMERCIAL_RIGHTS_NOT_AUTHORIZED");
  }
  if (!offer.rightsEvidenceRef?.trim()) reasonCodes.push("AUTHORIZATION_EVIDENCE_MISSING");
  if (!offer.merchantProductId?.trim() || !offer.merchantProductKey?.trim() ||
      !offer.merchantSlug.trim() || !offer.sourceIdentityKey.trim()) {
    reasonCodes.push("MERCHANT_IDENTITY_MISSING");
  }
  if (!["PARTNER_API", "PARTNER_FEED", "AFFILIATE_FEED", "MANUAL_VERIFIED"].includes(offer.sourceKind)) {
    reasonCodes.push("LEGACY_SOURCE_NOT_CURRENT_ELIGIBLE");
  }
  const identityEligible = reasonCodes.length === 0;
  const availabilityFreshness = metricFreshness(offer.availability, now,
    policies?.availability ?? null, identityEligible && offer.availability?.scope === "EXACT_SIZE" &&
      ["IN_STOCK", "OUT_OF_STOCK", "PREORDER", "UNKNOWN"].includes(offer.availabilityStatus));
  const validPrice = Boolean(offer.price && Number.isFinite(offer.price.amount) &&
    offer.price.amount > 0 && /^[A-Z]{3}$/u.test(offer.price.currency) &&
    ["PRODUCT", "EXACT_SIZE"].includes(offer.price.scope));
  const priceFreshness = metricFreshness(offer.price ? {
    ...offer.price, ingestedAt: offer.price.ingestedAt ?? null,
    evidenceRef: offer.price.evidenceRef ?? null,
  } : null, now, policies?.price ?? null, identityEligible && validPrice);
  if (availabilityFreshness === "UNKNOWN" || availabilityFreshness === "STALE")
    reasonCodes.push(`AVAILABILITY_${availabilityFreshness}`);
  if (priceFreshness === "UNKNOWN" || priceFreshness === "STALE")
    reasonCodes.push(`PRICE_${priceFreshness}`);
  if (offer.availabilityStatus === "UNKNOWN") reasonCodes.push("AVAILABILITY_UNKNOWN");
  const currentAvailabilityEligible = availabilityFreshness === "FRESH" &&
    offer.availabilityStatus !== "UNKNOWN";
  const currentPriceEligible = priceFreshness === "FRESH";
  const displayEligible = identityEligible &&
    (priceFreshness !== "UNKNOWN" || availabilityFreshness !== "UNKNOWN");

  return {
    offer,
    displayEligible,
    currentAvailabilityEligible,
    currentPriceEligible,
    purchaseReady: currentPriceEligible && currentAvailabilityEligible &&
      offer.availabilityStatus === "IN_STOCK" && offer.price?.scope === "EXACT_SIZE",
    reasonCodes,
    availabilityFreshness,
    priceFreshness,
  };
}

export function selectCurrentExactSizeOffers(
  offers: readonly ExactSizeMerchantOfferSnapshot[],
  requestedIdentity: CanonicalSizeIdentity,
  now: Date,
  policies: MerchantFreshnessPolicies | null,
) {
  const evaluated = reconcileMerchantObservations(offers, now, policies).map((group) => {
    const base = group.availability ?? group.price;
    if (!base) return null;
    const entry = evaluateCurrentExactSizeOffer({ ...base,
      price: group.price?.price ?? null,
      availability: group.availability?.availability ?? null,
      availabilityStatus: group.availability?.availabilityStatus ?? "UNKNOWN",
    }, requestedIdentity, now, policies);
    entry.reasonCodes.push(...group.conflictCodes);
    return entry;
  }).filter((entry): entry is EvaluatedMerchantOffer => entry != null);
  const displayEligible = evaluated
    .filter((entry) => entry.displayEligible)
    .sort(
      (left, right) =>
        left.offer.merchantSlug.localeCompare(right.offer.merchantSlug, "en") ||
        left.offer.id.localeCompare(right.offer.id, "en"),
    );

  return {
    evaluated,
    displayEligible,
    currentAvailabilityEligible: displayEligible.filter(
      (entry) => entry.currentAvailabilityEligible,
    ),
  };
}

/** Resolve metrics independently, partitioned by merchant/product/variant/canonical identity.
 * Returns original evidence carriers, not a synthesized offer or an ingestion-time winner.
 * Call before future presentation selection; conflicting metrics must not be promoted.
 */
export function reconcileMerchantObservations(
  offers: readonly ExactSizeMerchantOfferSnapshot[], now: Date,
  policies: MerchantFreshnessPolicies | null,
) {
  const groups = new Map<string, ExactSizeMerchantOfferSnapshot[]>();
  for (const offer of offers) {
    const key = JSON.stringify([offer.merchantSlug, offer.merchantProductId,
      offer.merchantProductKey, offer.sourceIdentityKey]);
    const group = groups.get(key) ?? [];
    group.push(offer);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    if (group.some((offer) => (Object.keys(group[0].identity) as (keyof CanonicalSizeIdentity)[])
      .some((field) => offer.identity[field] !== group[0].identity[field]))) {
      return { key, price: null, availability: null, conflictCodes: ["MULTIPLE_CANONICAL_SIZE_IDENTITIES"] };
    }
    const valid = group.map((offer) => evaluateCurrentExactSizeOffer(offer, group[0].identity, now, policies));
    const conflictCodes: string[] = [];
    function latest(metric: "price" | "availability") {
      const candidates = valid.filter((entry) => entry[`${metric}Freshness`] !== "UNKNOWN");
      const time = (entry: EvaluatedMerchantOffer) => timestampMs(metric === "price"
        ? entry.offer.price?.observedAt : entry.offer.availability?.observedAt);
      if (!candidates.length) return null;
      const newest = Math.max(...candidates.map(time));
      const latest = candidates.filter((entry) => time(entry) === newest);
      const values = new Set(latest.map(({ offer }) => metric === "price"
        ? JSON.stringify([offer.price?.amount, offer.price?.currency, offer.price?.scope])
        : offer.availabilityStatus));
      if (values.size !== 1) {
        conflictCodes.push(metric === "price" ? "CONTRADICTORY_PRICE" : "CONTRADICTORY_AVAILABILITY");
        return null;
      }
      return [...latest].sort((a, b) => a.offer.id.localeCompare(b.offer.id, "en"))[0].offer;
    }
    const price = latest("price");
    const availability = latest("availability");
    return { key, price, availability, conflictCodes };
  });
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
