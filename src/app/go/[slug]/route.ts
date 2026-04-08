import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAnalyticsEvent } from "@/lib/analytics/server";
import { getProductBySlug } from "@/lib/products";
import { SESSION_COOKIE_NAME } from "@/lib/session-id";

const outboundClickQuerySchema = z.object({
  from: z.string().trim().max(120).optional(),
  placement: z.string().trim().max(120).optional(),
  sizeCm: z.coerce.number().optional(),
  sizeLabel: z.string().trim().max(40).optional(),
  widthType: z.string().trim().max(40).optional(),
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

  if (!product?.affiliateUrl) {
    return NextResponse.redirect(getFallbackRedirectUrl(request));
  }

  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const payload = outboundClickQuerySchema.safeParse(searchParams);
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();

  if (payload.success && sessionId) {
    await saveAnalyticsEvent({
      sessionId,
      eventName: "product_clicked",
      pagePath: await getPagePathFromRequest(payload.data.from),
      payload: {
        board_slug: product.slug,
        destination_url: product.affiliateUrl,
        source: payload.data.from ?? "unknown",
        placement: payload.data.placement ?? null,
        size_cm: payload.data.sizeCm ?? null,
        size_label: payload.data.sizeLabel ?? null,
        width_type: payload.data.widthType ?? null,
      },
    });
  }

  return NextResponse.redirect(product.affiliateUrl);
}
