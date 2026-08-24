import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAnalyticsEvent } from "@/lib/analytics/server";
import { getCanonicalOfferIdentityBySlug } from "@/lib/canonical-catalog";
import { buildOutboundClickAnalyticsPayload } from "@/lib/outbound-click-analytics";
import { getExactSizeOfferIntelligence } from "@/lib/exact-size-offer";
import { getProductBySlug } from "@/lib/products";
import { isSavedResultStoreSource } from "@/lib/saved-result-contract";
import { SESSION_COOKIE_NAME } from "@/lib/session-id";
import {
  getStoreDestinationProvenance,
  resolveProductStoreUrl,
} from "@/lib/store-redirect";

const outboundClickQuerySchema = z.object({
  from: z.string().trim().max(120).optional(),
  placement: z.string().trim().max(120).optional(),
  sizeCm: z.coerce.number().optional(),
  sizeLabel: z.string().trim().max(40).optional(),
  sourceSizeLabel: z.string().trim().max(40).optional(),
  widthType: z.enum(["regular", "mid-wide", "wide"]).optional(),
  recommendationRank: z.coerce.number().int().positive().max(100).optional(),
  recommendationScore: z.coerce.number().finite().optional(),
  resultVariant: z.string().trim().max(40).optional(),
  algorithmVersion: z.string().trim().max(40).optional(),
});

function getFallbackRedirectUrl(request: Request) {
  const url = new URL(request.url);
  return new URL("/catalog", url.origin);
}

async function getPagePathFromRequest(from?: string) {
  const headerStore = await headers();
  const referer = headerStore.get("referer");

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return `${refererUrl.pathname}${refererUrl.search}`;
    } catch {
      // Игнорируем битый referer.
    }
  }

  return from ? `/outbound/${from}` : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  const destinationUrl = product ? resolveProductStoreUrl(product) : null;

  if (!product || !destinationUrl) {
    return NextResponse.redirect(getFallbackRedirectUrl(request));
  }

  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const payload = outboundClickQuerySchema.safeParse(searchParams);
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();

  if (
    payload.success &&
    sessionId &&
    !isSavedResultStoreSource(payload.data.from)
  ) {
    let canonicalIdentity = {
      boardSlug: product.slug,
      offerSlug: product.slug,
    };

    try {
      const resolvedIdentity = await getCanonicalOfferIdentityBySlug(product.slug);
      if (resolvedIdentity) {
        canonicalIdentity = resolvedIdentity;
      }
    } catch (error) {
      console.error(
        "Canonical offer identity lookup failed; using exact offer fallback.",
        {
          offerSlug: product.slug,
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
      );
    }

    const destination = getStoreDestinationProvenance(destinationUrl);
    const recommendedSize =
      payload.data.sizeCm != null && payload.data.widthType
        ? {
            sizeCm: payload.data.sizeCm,
            sizeLabel: payload.data.sizeLabel,
            widthType: payload.data.widthType,
          }
        : null;
    const offerIntelligence = getExactSizeOfferIntelligence({
      product,
      recommendedSize,
    });

    try {
      await saveAnalyticsEvent({
        sessionId,
        eventName: "product_clicked",
        pagePath: await getPagePathFromRequest(payload.data.from),
        payload: buildOutboundClickAnalyticsPayload({
          boardSlug: canonicalIdentity.boardSlug,
          offerSlug: canonicalIdentity.offerSlug,
          destinationUrl: destination.destinationUrl,
          from: payload.data.from,
          placement: payload.data.placement,
          sizeCm: payload.data.sizeCm,
          sizeLabel: payload.data.sizeLabel,
          sourceSizeLabel: payload.data.sourceSizeLabel,
          widthType: payload.data.widthType,
          productId: product.id,
          productSlug: product.slug,
          brand: product.brand,
          modelName: product.modelName,
          recommendationRank: payload.data.recommendationRank,
          recommendationScore: payload.data.recommendationScore,
          storeCode: destination.storeCode,
          sourceProductId: destination.sourceProductId,
          resultVariant: payload.data.resultVariant,
          algorithmVersion: payload.data.algorithmVersion,
          exactSizeOfferStatus: offerIntelligence.status,
          exactSizeMatched: offerIntelligence.exactSizeMatched,
        }),
      });
    } catch (error) {
      console.error("Outbound click analytics persistence failed.", {
        category: "outbound_click_analytics_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  return NextResponse.redirect(destinationUrl);
}
