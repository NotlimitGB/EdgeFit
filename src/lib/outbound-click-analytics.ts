export interface BuildOutboundClickAnalyticsPayloadArgs {
  boardSlug: string;
  offerSlug: string;
  destinationUrl: string;
  from?: string;
  placement?: string | null;
  sizeCm?: number | null;
  sizeLabel?: string | null;
  sourceSizeLabel?: string | null;
  widthType?: string | null;
}

export interface OutboundClickAnalyticsPayload
  extends Record<string, unknown> {
  board_slug: string;
  offer_slug: string;
  destination_url: string;
  source: string;
  placement: string | null;
  size_cm: number | null;
  size_label: string | null;
  source_size_label: string | null;
  width_type: string | null;
}

export function buildOutboundClickAnalyticsPayload({
  boardSlug,
  offerSlug,
  destinationUrl,
  from,
  placement,
  sizeCm,
  sizeLabel,
  sourceSizeLabel,
  widthType,
}: BuildOutboundClickAnalyticsPayloadArgs): OutboundClickAnalyticsPayload {
  return {
    board_slug: boardSlug,
    offer_slug: offerSlug,
    destination_url: destinationUrl,
    source: from ?? "unknown",
    placement: placement ?? null,
    size_cm: sizeCm ?? null,
    size_label: sizeLabel ?? null,
    source_size_label: sourceSizeLabel ?? null,
    width_type: widthType ?? null,
  };
}

const INTERNAL_URL_BASE = "https://edgefit.internal";

function getInternalStoreRedirect(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(href, INTERNAL_URL_BASE);
    if (url.origin !== INTERNAL_URL_BASE) {
      return null;
    }

    const match = /^\/go\/([^/]+)$/u.exec(url.pathname);
    if (!match) {
      return null;
    }

    const offerSlug = decodeURIComponent(match[1]);
    if (!offerSlug || offerSlug.includes("/")) {
      return null;
    }

    return { offerSlug, url };
  } catch {
    return null;
  }
}

export function enrichStoreClickClientPayload(
  href: string,
  analyticsPayload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const redirect = getInternalStoreRedirect(href);
  if (!redirect) {
    return analyticsPayload;
  }

  const enrichedPayload: Record<string, unknown> = {
    ...analyticsPayload,
    offer_slug: redirect.offerSlug,
  };
  const sourceSizeLabel = redirect.url.searchParams
    .get("sourceSizeLabel")
    ?.trim();

  if (analyticsPayload.source_size_label == null && sourceSizeLabel) {
    enrichedPayload.source_size_label = sourceSizeLabel;
  }

  return enrichedPayload;
}
