import type { ExactSizeOfferStatus } from "@/lib/exact-size-offer";
import type { BudgetRelation } from "@/lib/purchase-preferences";

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
  productId?: string | null;
  productSlug?: string | null;
  brand?: string | null;
  modelName?: string | null;
  recommendationRank?: number | null;
  recommendationScore?: number | null;
  storeCode?: string | null;
  sourceProductId?: string | null;
  resultVariant?: string | null;
  algorithmVersion?: string | null;
  exactSizeOfferStatus?: ExactSizeOfferStatus | null;
  exactSizeMatched?: boolean | null;
  clickedProductBudgetRelation?: BudgetRelation | null;
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
  product_id: string | null;
  product_slug: string;
  brand: string | null;
  model_name: string | null;
  recommendation_rank: number | null;
  recommendation_score: number | null;
  store_code: string | null;
  source_product_id: string | null;
  result_variant: string | null;
  algorithm_version: string | null;
  exact_size_offer_status: ExactSizeOfferStatus | null;
  exact_size_matched: boolean | null;
  clicked_product_budget_relation: BudgetRelation | null;
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
  productId,
  productSlug,
  brand,
  modelName,
  recommendationRank,
  recommendationScore,
  storeCode,
  sourceProductId,
  resultVariant,
  algorithmVersion,
  exactSizeOfferStatus,
  exactSizeMatched,
  clickedProductBudgetRelation,
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
    product_id: productId ?? null,
    product_slug: productSlug ?? offerSlug,
    brand: brand ?? null,
    model_name: modelName ?? null,
    recommendation_rank: recommendationRank ?? null,
    recommendation_score: recommendationScore ?? null,
    store_code: storeCode ?? null,
    source_product_id: sourceProductId ?? null,
    result_variant: resultVariant ?? null,
    algorithm_version: algorithmVersion ?? null,
    exact_size_offer_status: exactSizeOfferStatus ?? null,
    exact_size_matched: exactSizeMatched ?? null,
    clicked_product_budget_relation: clickedProductBudgetRelation ?? null,
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
    product_slug: redirect.offerSlug,
  };
  const sourceSizeLabel = redirect.url.searchParams
    .get("sourceSizeLabel")
    ?.trim();

  if (analyticsPayload.source_size_label == null && sourceSizeLabel) {
    enrichedPayload.source_size_label = sourceSizeLabel;
  }

  return enrichedPayload;
}
