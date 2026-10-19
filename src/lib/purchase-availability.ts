import type {
  CanonicalSizeIdentity,
  ExactSizeMerchantOfferSnapshot,
  FreshnessPolicy,
  FreshnessStatus,
  MerchantAvailabilityStatus,
  MerchantSourceKind,
} from "@/lib/merchant-offers";

export interface PurchaseAvailability {
  status: "verified_available" | "verified_unavailable" | "unknown";
  freshness: FreshnessStatus;
  /** An observation, not an unconditional claim about current stock. */
  observedStockStatus: MerchantAvailabilityStatus;
}

export function legacyPurchaseAvailability(): PurchaseAvailability {
  return { status: "unknown", freshness: "UNKNOWN", observedStockStatus: "UNKNOWN" };
}

/** Source-only compatibility with 040H's independent availability carrier.
 * No reader, policy defaults, acquisition or production schema is introduced. */
export type AvailabilityEvidenceOffer = ExactSizeMerchantOfferSnapshot & {
  merchantProductId?: string | null;
  merchantProductKey?: string | null;
  rightsEvidenceRef?: string | null;
  availability?: {
    scope: "PRODUCT" | "EXACT_SIZE";
    observedAt: string | Date | null;
    evidenceRef: string | null;
    sourceUrl: string;
    merchantUpdatedAt: string | Date | null;
    ingestedAt: string | Date | null;
  } | null;
};

/** Only an explicit current-table read is accepted here. Historical observations
 * cannot grant or restore rights. 040H owns verified authority-event resolution. */
export interface CurrentAvailabilityAuthority {
  basis: "CURRENT_TABLES";
  merchantSlug: string;
  merchantProductId: string;
  merchantProductKey: string;
  sourceKind: MerchantSourceKind;
  merchantStatus: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  sourceStatus: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  commercialRightsStatus: "AUTHORIZED" | "UNKNOWN" | "RESTRICTED";
  rightsEvidenceRef: string | null;
}

export interface AvailabilitySourcePolicy extends FreshnessPolicy {
  version: string;
  merchantSlug: string;
  merchantProductKey: string;
  sourceKind: MerchantSourceKind;
}

// Same calendar checks as the reviewed 040H source; Date.parse alone normalizes
// impossible dates. No fallback to the common observedAt or ingestion timestamp.
function timestampMs(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return NaN;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!parts) return NaN;
  const [, y, m, d, h, minute, second] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
    Number(h) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59 ||
    Number(parts[10] ?? 0) > 23 || Number(parts[11] ?? 0) > 59) return NaN;
  return Date.parse(value);
}

function isPublicUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function sameIdentity(left: CanonicalSizeIdentity, right: CanonicalSizeIdentity) {
  return (Object.keys(right) as (keyof CanonicalSizeIdentity)[])
    .every((key) => left[key] === right[key]);
}

/** Pure availability projection over the existing merchant-offer model.
 * Public legacy consumers deliberately do not call this function. Future 040H
 * integration must supply its current authority and independent observations.
 * Price is independent: a price never proves stock, and stock does not prove a
 * fresh price. This result alone must not be used as a priced purchase-ready offer.
 */
export function evaluatePurchaseAvailability(args: {
  offers: readonly AvailabilityEvidenceOffer[];
  requestedIdentity: CanonicalSizeIdentity;
  authority: readonly CurrentAvailabilityAuthority[];
  policies: readonly AvailabilitySourcePolicy[];
  now: Date;
}): PurchaseAvailability {
  const nowMs = args.now.getTime();
  if (!Number.isFinite(nowMs)) return legacyPurchaseAvailability();
  for (const policy of args.policies) {
    if (!policy.version.trim() || !Number.isFinite(policy.freshThroughMs) ||
      !Number.isFinite(policy.staleAfterMs) || policy.freshThroughMs < 0 ||
      policy.staleAfterMs < policy.freshThroughMs) {
      throw new Error("Invalid availability freshness policy");
    }
  }

  const groups = new Map<string, AvailabilityEvidenceOffer[]>();
  for (const offer of args.offers) {
    const key = JSON.stringify([offer.merchantSlug, offer.merchantProductId,
      offer.merchantProductKey, offer.sourceKind, offer.sourceIdentityKey]);
    const group = groups.get(key) ?? [];
    group.push(offer);
    groups.set(key, group);
  }

  const results = [...groups.values()]
    .filter((group) => group.some((offer) => sameIdentity(offer.identity, args.requestedIdentity)))
    .map((group): PurchaseAvailability => {
    const base = group[0];
    if (!group.every((offer) => sameIdentity(offer.identity, args.requestedIdentity))) {
      return legacyPurchaseAvailability();
    }
    const authority = args.authority.filter((entry) => entry.basis === "CURRENT_TABLES" &&
      entry.merchantSlug === base.merchantSlug && entry.merchantProductId === base.merchantProductId &&
      entry.merchantProductKey === base.merchantProductKey && entry.sourceKind === base.sourceKind);
    const policies = args.policies.filter((entry) => entry.merchantSlug === base.merchantSlug &&
      entry.merchantProductKey === base.merchantProductKey && entry.sourceKind === base.sourceKind);
    if (!base.merchantSlug.trim() || !base.merchantProductId?.trim() || !base.merchantProductKey?.trim() ||
      !base.sourceIdentityKey.trim() || authority.length !== 1 || policies.length !== 1 ||
      args.authority.some((entry) => entry.merchantSlug === base.merchantSlug && entry.merchantStatus !== "ACTIVE") ||
      authority[0].merchantStatus !== "ACTIVE" || authority[0].sourceStatus !== "ACTIVE" ||
      authority[0].commercialRightsStatus !== "AUTHORIZED" || !authority[0].rightsEvidenceRef?.trim() ||
      base.sourceKind === "LEGACY_IMPORT" || base.sourceKind === "PUBLIC_REFERENCE") {
      return legacyPurchaseAvailability();
    }

    // A malformed or disqualified member cannot resurrect an older IN_STOCK row.
    if (group.some((offer) => !offer.availability || offer.availability.scope !== "EXACT_SIZE" ||
      !offer.availability.evidenceRef?.trim() || !isPublicUrl(offer.availability.sourceUrl) ||
      !isPublicUrl(offer.sourceUrl) || !isPublicUrl(offer.merchantProductUrl) ||
      !offer.rightsEvidenceRef?.trim() || offer.merchantStatus !== "ACTIVE" || offer.sourceStatus !== "ACTIVE" ||
      offer.commercialRightsStatus !== "AUTHORIZED" || offer.reconciliationStatus !== "MATCHED" ||
      offer.reconciliationCodes.length > 0 || !Number.isFinite(timestampMs(offer.availability.observedAt)) ||
      timestampMs(offer.availability.observedAt) > nowMs ||
      !Number.isFinite(timestampMs(offer.availability.ingestedAt)) ||
      timestampMs(offer.availability.ingestedAt) > nowMs ||
      timestampMs(offer.availability.ingestedAt) < timestampMs(offer.availability.observedAt))) {
      return legacyPurchaseAvailability();
    }

    const latestMs = Math.max(...group.map((offer) => timestampMs(offer.availability!.observedAt)));
    const latest = group.filter((offer) => timestampMs(offer.availability!.observedAt) === latestMs);
    const statuses = new Set(latest.map((offer) => offer.availabilityStatus));
    if (statuses.size !== 1) return legacyPurchaseAvailability();
    const stock = latest[0].availabilityStatus;
    const policy = policies[0];
    const age = nowMs - latestMs;
    const freshness = age <= policy.freshThroughMs ? "FRESH" : age <= policy.staleAfterMs ? "AGING" : "STALE";
    return {
      status: freshness === "FRESH" && stock === "IN_STOCK" ? "verified_available" :
        freshness === "FRESH" && stock === "OUT_OF_STOCK" ? "verified_unavailable" : "unknown",
      freshness,
      observedStockStatus: stock,
    };
  });

  // Different merchants are independent; one unknown source is never inferred to
  // be sold out. A verified offer at another merchant can still be available.
  return results.find((entry) => entry.status === "verified_available") ??
    (results.length > 0 && results.every((entry) => entry.status === "verified_unavailable")
      ? results[0] : results.length === 1 ? results[0] : legacyPurchaseAvailability());
}
