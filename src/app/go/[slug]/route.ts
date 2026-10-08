import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { withDbDiagnosticContext, withDbDiagnosticStage } from "@/lib/database/lifecycle-diagnostics";
import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAnalyticsEvent } from "@/lib/analytics/server";
import { getCanonicalOfferIdentityBySlug } from "@/lib/canonical-catalog";
import { buildOutboundClickAnalyticsPayload } from "@/lib/outbound-click-analytics";
import { getExactSizeOfferIntelligence } from "@/lib/exact-size-offer";
import { getProductBySlug } from "@/lib/products";
import { isSavedResultStoreSource } from "@/lib/saved-result-contract";
import { getBudgetRelation } from "@/lib/purchase-preferences";
import { SESSION_COOKIE_NAME } from "@/lib/session-id";
import { withOperationDeadline } from "@/lib/operation-deadline";
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
  budgetMaxRub: z.coerce.number().int().min(1).max(1_000_000).optional(),
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
  const controller = new AbortController();
  try {
    return await withOperationDeadline(() => withDbDiagnosticContext(
      { scope: "outbound", stage: "request", traceId: randomUUID() }, () => handleGet(request, params, controller.signal)), 12_000, () => controller.abort());
  } catch {
    console.error(JSON.stringify({ event: "outbound_failure", category: "lookup_unavailable" }));
    return new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Магазин временно недоступен</title><h1>Не удалось открыть магазин</h1><p>Попробуй ещё раз или вернись к каталогу.</p><p><a href="">Попробовать снова</a></p><a href="/catalog">Вернуться в каталог</a></html>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }
}

async function handleGet(request: Request, params: Promise<{ slug: string }>, signal: AbortSignal) {
  const { slug } = await params;
  const product = await withOperationDeadline(() => withDbDiagnosticStage("product_lookup", () => getProductBySlug(slug)), 8_000);
  signal.throwIfAborted();
  const destinationUrl = product ? resolveProductStoreUrl(product) : null;

  if (!product || !destinationUrl) {
    return NextResponse.redirect(getFallbackRedirectUrl(request));
  }

  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const payload = outboundClickQuerySchema.safeParse(searchParams);
  const cookieStore = await cookies();
  signal.throwIfAborted();
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
      const resolvedIdentity = await withOperationDeadline(() => getCanonicalOfferIdentityBySlug(product.slug), 500);
      if (resolvedIdentity) {
        canonicalIdentity = resolvedIdentity;
      }
    } catch {
      console.error(
        "Canonical offer identity lookup failed; using exact offer fallback.",
        {
          category: "canonical_offer_lookup_unavailable",
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

    const analyticsController = new AbortController();
    try {
      await withOperationDeadline(async () => {
        const pagePath = await getPagePathFromRequest(payload.data.from);
        analyticsController.signal.throwIfAborted();
        signal.throwIfAborted();
        return saveAnalyticsEvent({
        sessionId,
        eventName: "product_clicked",
        requestUrl: request.url,
        pagePath,
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
          clickedProductBudgetRelation: getBudgetRelation(
            product.priceFrom,
            payload.data.budgetMaxRub ?? null,
          ),
        }),
        });
      }, 500, () => analyticsController.abort());
    } catch {
      console.error("Outbound click analytics persistence failed.", {
        category: "outbound_click_analytics_failed",
      });
    }
  }

  return NextResponse.redirect(destinationUrl);
}
