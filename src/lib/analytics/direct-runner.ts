import "server-only";
import type { Sql } from "postgres";
import { получитьКлиентБазы } from "@/lib/database/client";
import { getAnalyticsReport } from "@/lib/analytics/reporting-server";
import { buildWeeklyAnalyticsDigest } from "@/lib/analytics/digest";
import { buildReportWindows } from "@/lib/analytics/reporting-core";
import { parseAnalyticsDeliveryConfig, type AnalyticsDeliveryResult } from "@/lib/analytics/delivery-core";
import {
  createPostgresAnalyticsDeliveryRepository, createResendAnalyticsMailer,
  runWeeklyAnalyticsDelivery, runAnalyticsDeliveryRetrySweep,
  type AnalyticsDeliveryDependencies,
} from "@/lib/analytics/delivery-server";
import { expectedWeeklyId } from "../../../scripts/analytics-scheduler.mjs";

// W43 is the owner's confirmed historical baseline. Never infer coverage before it.
const COVERAGE_BASELINE = "2026-10-19";

export async function hasMissedWeeklyDelivery(sql: Sql, currentWeekStart: string): Promise<boolean> {
  const rows = await sql<{ missing: boolean }[]>`
    with expected as (
      select generate_series(${COVERAGE_BASELINE}::date,
        ${currentWeekStart}::date - 7, interval '7 days')::date as start_date
    )
    select exists (
      select 1 from expected e
      where not exists (
        select 1 from analytics_digest_deliveries d
        where d.kind = 'weekly'
          and d.period_start = e.start_date
          and d.period_end = e.start_date + 6
          and d.logical_id = 'weekly:' || to_char(e.start_date, 'IYYY-"W"IW')
          and d.delivery_status in ('sent', 'partial_sent')
      )
    ) as missing
  `;
  return rows[0]?.missing !== false;
}

export function validateDirectConfig(env: Record<string, string | undefined>, kind: string) {
  if (kind !== "weekly" && kind !== "retry") return "invalid_operation";
  const delivery = parseAnalyticsDeliveryConfig(env);
  if (delivery.state !== "enabled") return delivery.state === "disabled" ? "delivery_disabled" : delivery.category;
  if (!env.DATABASE_URL?.trim() || env.DATABASE_SSL === "disable") return "database_config_invalid";
  if (kind === "weekly" && (!env.YANDEX_METRIKA_OAUTH_TOKEN?.trim() ||
      !/^[1-9]\d*$/.test(env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim() ?? ""))) return "metrika_config_invalid";
  return null;
}

export async function runDirectDelivery(
  kind: string,
  options: {
    env?: Record<string, string | undefined>;
    now?: Date;
    dependencies?: AnalyticsDeliveryDependencies;
    hasMissed?: (currentWeekStart: string) => Promise<boolean>;
  } = {},
): Promise<AnalyticsDeliveryResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const invalid = validateDirectConfig(env, kind);
  if (invalid) return { status: "failed", category: invalid };
  const dependencies = options.dependencies ?? {
    env,
    reportLoader: getAnalyticsReport,
    repositoryFactory: () => createPostgresAnalyticsDeliveryRepository(получитьКлиентБазы()),
    mailerFactory: createResendAnalyticsMailer,
    logger: console,
    failureNotices: false,
  };
  try {
    if (kind === "weekly") {
      const expected = expectedWeeklyId(now);
      const start = buildReportWindows(now).windows.last7Days.startDate;
      if (start <= "2026-10-26") return { status: "failed", category: "historical_week_not_supported" };
      const missed = options.hasMissed ?? ((date: string) => hasMissedWeeklyDelivery(получитьКлиентБазы(), date));
      if (await missed(start)) return { status: "failed", category: "missed_week_reconciliation_required" };
      const guarded = { ...dependencies, failureNotices: false,
        reportLoader: async (input?: { now?: Date }) => {
          const report = await dependencies.reportLoader(input);
          const digest = buildWeeklyAnalyticsDigest(report);
          if (digest.logicalId !== expected || digest.periods.last7Days.startDate !== start) {
            throw new Error("weekly_identity_mismatch");
          }
          return report;
        },
      };
      const result = await runWeeklyAnalyticsDelivery({ now, dependencies: guarded });
      if (result.logicalId && result.logicalId !== expected) return { status: "failed", category: "weekly_identity_mismatch" };
      return result;
    }
    let blockedHistoricalW44 = false;
    const guardedRetry = { ...dependencies, failureNotices: false,
      repositoryFactory: (config: Parameters<AnalyticsDeliveryDependencies["repositoryFactory"]>[0]) => {
        const repository = dependencies.repositoryFactory(config);
        return { ...repository,
          listDue: async (at: Date, limit: number) => {
            const rows = await repository.listDue(at, limit);
            blockedHistoricalW44 ||= rows.some((row) => row.logicalId === "weekly:2026-W44");
            return rows.filter((row) => row.logicalId !== "weekly:2026-W44");
          },
          // Preserve W43 and existing evidence; retention is an explicit owner decision.
          cleanup: async () => 0,
        };
      },
    };
    const result = await runAnalyticsDeliveryRetrySweep({ now, dependencies: guardedRetry });
    return blockedHistoricalW44 ? { status: "failed", category: "historical_w44_requires_owner_action" } : result;
  } catch {
    return { status: "failed", category: "direct_execution_failed" };
  }
}
