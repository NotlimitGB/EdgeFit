import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAnalyticsReport,
  hasUsableAnalyticsSource,
} from "@/lib/analytics/reporting-server";
import {
  INTERNAL_ACCESS_COOKIE,
  isInternalAccessConfigured,
  isValidInternalAccessToken,
} from "@/lib/internal/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isInternalAccessConfigured()) {
    return NextResponse.json(
      { message: "Internal access is not configured." },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(INTERNAL_ACCESS_COOKIE)?.value;

  if (!(await isValidInternalAccessToken(token))) {
    return NextResponse.json(
      { message: "Authentication is required." },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }

  try {
    const report = await getAnalyticsReport();

    return NextResponse.json(report, {
      status: hasUsableAnalyticsSource(report) ? 200 : 503,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(
      {
        message: "Analytics report is temporarily unavailable.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  }
}
