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
  try {
    const payload = analyticsEventSchema.parse(await request.json());

    await saveAnalyticsEvent(payload);

    return NextResponse.json({
      received: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить событие аналитики.",
      },
      { status: 400 },
    );
  }
}
