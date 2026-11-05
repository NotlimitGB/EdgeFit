import "server-only";
import { buildWeeklyAnalyticsDigest } from "@/lib/analytics/digest";
import { authorizeAnalyticsCron } from "@/lib/analytics/delivery-core";
import { getAnalyticsReport } from "@/lib/analytics/reporting-server";

// A fixed Moscow Monday generates Sunday 1 November as the as-of date.
const W44_ANCHOR = "2026-11-02T06:30:00.000Z";

export async function preflightW44(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env,
  reportLoader: typeof getAnalyticsReport = getAnalyticsReport,
) {
  const auth = authorizeAnalyticsCron(authorization, env.CRON_SECRET);
  if (!auth.ok) return { httpStatus: auth.status, body: { status: "failed", category: auth.category } };
  if (env.ANALYTICS_W44_PREFLIGHT_ENABLED !== "true") {
    return { httpStatus: 404, body: { status: "disabled" } };
  }
  try {
    const digest = buildWeeklyAnalyticsDigest(await reportLoader({ now: new Date(W44_ANCHOR) }));
    if (digest.logicalId !== "weekly:2026-W44" ||
        digest.periods.last7Days.startDate !== "2026-10-26" ||
        digest.periods.last7Days.endDate !== "2026-11-01") {
      return { httpStatus: 409, body: { status: "failed", category: "historical_period_mismatch" } };
    }
    return { httpStatus: 200, body: {
      status: digest.status,
      logicalId: digest.logicalId,
      period: digest.periods.last7Days,
      sourceStatus: digest.sourceStatus,
    } };
  } catch {
    return { httpStatus: 500, body: { status: "failed", category: "historical_preflight_failed" } };
  }
}
