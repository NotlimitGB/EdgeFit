import { normalizeReferralDomain } from "@/lib/analytics/referral-domain";
import { isPrivateSavedResultPath } from "@/lib/saved-result-contract";
import { getConfiguredSiteHosts } from "@/lib/site-url";

export const ACQUISITION_STORAGE_KEY =
  "edgefit.acquisition-first-touch.v1";

export const acquisitionClassifications = [
  "campaign",
  "external_referral",
  "self_referral",
  "direct_or_unknown",
] as const;

export type AcquisitionClassification =
  (typeof acquisitionClassifications)[number];

export interface FirstTouchAcquisitionContext {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  landingPath: string;
  referrerDomain: string | null;
  classification: AcquisitionClassification;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface AcquisitionCaptureInput {
  pathname: string;
  search: string;
  referrer: string;
  selfReferralHosts: readonly string[];
}

const MAX_UTM_LENGTH = 120;
const MAX_LANDING_PATH_LENGTH = 300;
const unsafeCampaignValuePattern =
  /[\u0000-\u001f\u007f@?#&=\\]|[a-z][a-z0-9+.-]*:\/\//iu;

function normalizeCampaignValue(value: string | null) {
  if (value == null) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/gu, " ");

  if (!normalized || unsafeCampaignValuePattern.test(normalized)) {
    return null;
  }

  return normalized.slice(0, MAX_UTM_LENGTH);
}

function normalizeLandingPath(pathname: string) {
  const trimmed = pathname.trim();

  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("?") ||
    trimmed.includes("#")
  ) {
    return "/";
  }

  return trimmed.slice(0, MAX_LANDING_PATH_LENGTH);
}

function isAcquisitionClassification(
  value: unknown,
): value is AcquisitionClassification {
  return acquisitionClassifications.includes(
    value as AcquisitionClassification,
  );
}

function nullableString(value: unknown) {
  return value == null || typeof value === "string" ? value : undefined;
}

export function parseStoredAcquisitionContext(
  value: string | null,
): FirstTouchAcquisitionContext | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const source = nullableString(parsed.source);
    const medium = nullableString(parsed.medium);
    const campaign = nullableString(parsed.campaign);
    const content = nullableString(parsed.content);
    const term = nullableString(parsed.term);
    const referrerDomain = nullableString(parsed.referrerDomain);

    if (
      source === undefined ||
      medium === undefined ||
      campaign === undefined ||
      content === undefined ||
      term === undefined ||
      referrerDomain === undefined ||
      typeof parsed.landingPath !== "string" ||
      normalizeLandingPath(parsed.landingPath) !== parsed.landingPath ||
      !isAcquisitionClassification(parsed.classification)
    ) {
      return null;
    }

    const normalizedValues = [source, medium, campaign, content, term].map(
      (item) => normalizeCampaignValue(item),
    );

    if (
      [source, medium, campaign, content, term].some(
        (item, index) => item !== normalizedValues[index],
      )
    ) {
      return null;
    }

    const normalizedReferrer = normalizeReferralDomain(referrerDomain);
    if (normalizedReferrer !== referrerDomain) {
      return null;
    }

    const hasCampaignEvidence = Boolean(source || campaign);
    const hasReferrerEvidence = Boolean(referrerDomain);
    if (
      (parsed.classification === "campaign" && !hasCampaignEvidence) ||
      (parsed.classification !== "campaign" && hasCampaignEvidence) ||
      (parsed.classification === "direct_or_unknown" && hasReferrerEvidence) ||
      (["external_referral", "self_referral"].includes(
        parsed.classification as string,
      ) && !hasReferrerEvidence)
    ) {
      return null;
    }

    return {
      source,
      medium,
      campaign,
      content,
      term,
      landingPath: parsed.landingPath,
      referrerDomain,
      classification: parsed.classification,
    };
  } catch {
    return null;
  }
}

export function buildFirstTouchAcquisitionContext({
  pathname,
  search,
  referrer,
  selfReferralHosts,
}: AcquisitionCaptureInput): FirstTouchAcquisitionContext {
  const searchParams = new URLSearchParams(search);
  const source = normalizeCampaignValue(searchParams.get("utm_source"));
  const medium = normalizeCampaignValue(searchParams.get("utm_medium"));
  const campaign = normalizeCampaignValue(searchParams.get("utm_campaign"));
  const content = normalizeCampaignValue(searchParams.get("utm_content"));
  const term = normalizeCampaignValue(searchParams.get("utm_term"));
  const referrerDomain = normalizeReferralDomain(referrer);
  const normalizedSelfHosts = new Set(
    selfReferralHosts.flatMap((host) => {
      const normalized = normalizeReferralDomain(host);
      return normalized ? [normalized] : [];
    }),
  );
  const classification: AcquisitionClassification =
    source || campaign
      ? "campaign"
      : referrerDomain
        ? normalizedSelfHosts.has(referrerDomain)
          ? "self_referral"
          : "external_referral"
        : "direct_or_unknown";

  return {
    source,
    medium,
    campaign,
    content,
    term,
    landingPath: normalizeLandingPath(pathname),
    referrerDomain,
    classification,
  };
}

export function getOrCaptureFirstTouchAcquisitionContext({
  storage,
  ...input
}: AcquisitionCaptureInput & { storage: StorageLike }) {
  if (isPrivateSavedResultPath(input.pathname)) {
    return null;
  }

  try {
    const stored = parseStoredAcquisitionContext(
      storage.getItem(ACQUISITION_STORAGE_KEY),
    );
    if (stored) {
      return stored;
    }
    storage.removeItem(ACQUISITION_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in privacy-restricted browsers.
  }

  const context = buildFirstTouchAcquisitionContext(input);

  try {
    storage.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Analytics remains fail-open when sessionStorage is unavailable.
  }

  return context;
}

export function captureCurrentFirstTouchAcquisitionContext() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  try {
    return getOrCaptureFirstTouchAcquisitionContext({
      storage: window.sessionStorage,
      pathname: window.location.pathname,
      search: window.location.search,
      referrer: document.referrer,
      selfReferralHosts: [
        ...getConfiguredSiteHosts(),
        window.location.hostname,
      ],
    });
  } catch {
    return buildFirstTouchAcquisitionContext({
      pathname: window.location.pathname,
      search: window.location.search,
      referrer: document.referrer,
      selfReferralHosts: [
        ...getConfiguredSiteHosts(),
        window.location.hostname,
      ],
    });
  }
}

export function buildAcquisitionAnalyticsPayload(
  context: FirstTouchAcquisitionContext | null,
) {
  return context
    ? {
        acquisition_source: context.source,
        acquisition_medium: context.medium,
        acquisition_campaign: context.campaign,
        acquisition_content: context.content,
        acquisition_term: context.term,
        acquisition_landing_path: context.landingPath,
        acquisition_referrer_domain: context.referrerDomain,
        acquisition_classification: context.classification,
      }
    : {};
}
