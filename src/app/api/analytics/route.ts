import { publicApiError } from "@/lib/public-api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAnalyticsEvent } from "@/lib/analytics/server";

const analyticsEventSchema = z.object({
  sessionId: z.string().trim().min(1).max(120),
  eventName: z.string().trim().min(1).max(120),
  pagePath: z.string().trim().max(300).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  let parsingInput = true;
  try {
    const payload = analyticsEventSchema.parse(await request.json());

    parsingInput = false;
    await saveAnalyticsEvent({
      ...payload,
      requestUrl: request.url,
    });

    return NextResponse.json({
      received: true,
    });
  } catch (error) {
    return publicApiError("analytics", error, parsingInput, "Проверь данные события аналитики.");
  }
}
