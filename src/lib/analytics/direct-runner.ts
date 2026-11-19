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

const HISTORICAL_WEEKS = {
  "2026-W44": { start: "2026-10-26", end: "2026-11-01", anchor: "2026-11-02" },
  "2026-W45": { start: "2026-11-02", end: "2026-11-08", anchor: "2026-11-09" },
  "2026-W46": { start: "2026-11-09", end: "2026-11-15", anchor: "2026-11-16" },
} as const;
const FIRST_SCHEDULED_WEEK = "2026-11-16";
const CLOSURE_REASONS = ["sources_incomplete", "provider_unverified", "prior_delivery_confirmed"] as const;
type ClosureReason = (typeof CLOSURE_REASONS)[number];

export async function findMissedWeeklyDeliveries(sql: Sql, currentWeekStart: string) {
  return sql<{ logicalId: string; historical: boolean }[]>`
    with expected as (
      select distinct start_date::date, 'weekly:' || to_char(start_date, 'IYYY-"W"IW') as logical_id
      from (
        select generate_series(date '2026-10-19', date '2026-11-09', interval '7 days') as start_date
        union all
        select generate_series(greatest(date '2026-11-16', ${currentWeekStart}::date - 7 * 12),
          ${currentWeekStart}::date - 7, interval '7 days')
      ) weeks
    )
    select logical_id as "logicalId", start_date < ${FIRST_SCHEDULED_WEEK}::date as historical
    from expected e
    where not exists (
        select 1 from analytics_digest_deliveries d
        where d.kind = 'weekly'
          and d.period_start = e.start_date
          and d.period_end = e.start_date + 6
          and d.logical_id = e.logical_id
          and d.delivery_status in ('sent', 'partial_sent')
          and d.sent_at is not null
          and nullif(btrim(d.provider_message_id), '') is not null
    )
    order by start_date
  `;
}

async function readWeeklyLedger(sql: Sql, logicalId: string, weekStart: string) {
  const [row] = await sql<{ state: string }[]>`
    select case
      when delivery_status in ('sent', 'partial_sent') and (
        kind <> 'weekly' or period_start <> ${weekStart}::date or period_end <> ${weekStart}::date + 6
        or sent_at is null or nullif(btrim(provider_message_id), '') is null
      ) then 'unverified_receipt'
      else delivery_status
    end as state
    from analytics_digest_deliveries where logical_id = ${logicalId}
  `;
  return row?.state ?? "missing";
}

function isHistoricalWeek(week: string): week is keyof typeof HISTORICAL_WEEKS {
  return Object.hasOwn(HISTORICAL_WEEKS, week);
}

function parseHistoricalClosures(value: string | undefined) {
  const closures = new Map<string, ClosureReason>();
  if (!value?.trim()) return closures;
  for (const entry of value.trim().split(",")) {
    const [week, reason, extra] = entry.trim().split(":");
    const allowedReason = CLOSURE_REASONS.find((allowed) => allowed === reason);
    const logicalId = `weekly:${week}`;
    if (!isHistoricalWeek(week) || !allowedReason || extra !== undefined || closures.has(logicalId)) return null;
    closures.set(logicalId, allowedReason);
  }
  return closures;
}

function verifySources(env: Record<string, string | undefined>, needsMetrika: boolean) {
  if (!env.DATABASE_URL?.trim() || env.DATABASE_SSL !== "require") return "database_config_invalid";
  if (needsMetrika && (!env.YANDEX_METRIKA_OAUTH_TOKEN?.trim() ||
      !/^[1-9]\d*$/.test(env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim() ?? ""))) return "metrika_config_invalid";
  return null;
}

export function validateDirectConfig(env: Record<string, string | undefined>, kind: string) {
  if (kind === "historical-audit") return verifySources(env, true);
  if (kind !== "weekly" && kind !== "retry" && kind !== "historical-recover") return "invalid_operation";
  const delivery = parseAnalyticsDeliveryConfig(env);
  if (delivery.state !== "enabled") return delivery.state === "disabled" ? "delivery_disabled" : delivery.category;
  return verifySources(env, kind !== "retry");
}

export async function runDirectDelivery(
  kind: string,
  options: {
    env?: Record<string, string | undefined>;
    now?: Date;
    dependencies?: AnalyticsDeliveryDependencies;
    findMissed?: (currentWeekStart: string) => ReturnType<typeof findMissedWeeklyDeliveries>;
    historicalWeek?: string;
    providerChecked?: boolean;
    readLedger?: (logicalId: string, weekStart: string) => Promise<string>;
    scheduledRetry?: boolean;
  } = {},
): Promise<AnalyticsDeliveryResult> {
  const configuredEnv = options.env ?? process.env;
  const historical = kind === "historical-audit" || kind === "historical-recover";
  if (kind === "historical-recover" &&
      (configuredEnv.ANALYTICS_HISTORICAL_RECOVERY_ENABLED !== "true" || options.providerChecked !== true)) {
    return { status: "failed", category: "historical_recovery_not_authorized" };
  }
  const env = kind === "historical-recover"
    ? { ...configuredEnv, ANALYTICS_DELIVERY_ENABLED: "true" }
    : configuredEnv;
  const now = options.now ?? new Date();
  const invalid = validateDirectConfig(env, kind);
  if (invalid) return { status: "failed", category: invalid };
  const closures = parseHistoricalClosures(env.ANALYTICS_HISTORICAL_NO_REPLAY);
  if (!closures) return { status: "failed", category: "historical_closure_config_invalid" };
  const dependencies = options.dependencies ?? {
    env,
    reportLoader: getAnalyticsReport,
    repositoryFactory: () => createPostgresAnalyticsDeliveryRepository(получитьКлиентБазы()),
    mailerFactory: createResendAnalyticsMailer,
    logger: console,
    failureNotices: false,
  };
  const readLedger = options.readLedger ?? ((id: string, start: string) => readWeeklyLedger(получитьКлиентБазы(), id, start));
  try {
    if (historical) {
      const week = options.historicalWeek ?? "";
      if (!isHistoricalWeek(week)) return { status: "failed", category: "historical_period_invalid" };
      const period = HISTORICAL_WEEKS[week];
      const logicalId = `weekly:${week}`;
      const reportNow = new Date(`${period.anchor}T06:30:00.000Z`);
      if (reportNow > now) return { status: "failed", logicalId, category: "historical_period_invalid" };
      const closureReason = closures.get(logicalId);
      if (closureReason) {
        dependencies.logger.info("analytics_historical_closed_without_replay", { logicalId, reason: closureReason });
        return {
          status: kind === "historical-audit" ? "noop" : "failed",
          logicalId,
          category: "historical_closed_without_replay",
        };
      }
      const ledger = await readLedger(logicalId, period.start);
      if (ledger === "sent" || ledger === "partial_sent") {
        return { status: "noop", logicalId, category: "historical_already_sent" };
      }
      if (ledger !== "missing") return { status: "failed", logicalId, category: "historical_ledger_exists" };
      const report = await dependencies.reportLoader({ now: reportNow });
      const digest = buildWeeklyAnalyticsDigest(report);
      const reportingWeek = digest.periods.last7Days;
      if (digest.logicalId !== logicalId || reportingWeek.startDate !== period.start || reportingWeek.endDate !== period.end) {
        return { status: "failed", logicalId, category: "weekly_identity_mismatch" };
      }
      if (kind === "historical-audit") {
        dependencies.logger.info("analytics_historical_sources", {
          logicalId,
          firstParty: digest.sourceStatus.firstParty.status,
          metrika: digest.sourceStatus.metrika.status,
          acquisition: digest.sourceStatus.acquisition.status,
          hasUnobservedEventDays: digest.dataQuality.some(({ code }) => code === "first_party_week_coverage_incomplete"),
          trafficSampling: digest.sampling.traffic.last7Days?.status ?? "unknown",
        });
      }
      if (digest.status !== "complete") return { status: "failed", logicalId, category: "historical_sources_incomplete" };
      if (kind === "historical-audit") return { status: "noop", logicalId, category: "historical_sources_ready" };
      return await runWeeklyAnalyticsDelivery({
        now, historical: { reportNow, now: options.now ? () => now : () => new Date() },
        dependencies: { ...dependencies, env, reportLoader: async () => report, failureNotices: false },
      });
    }
    if (kind === "weekly") {
      const expected = expectedWeeklyId(now);
      const start = buildReportWindows(now).windows.last7Days.startDate;
      if (start < FIRST_SCHEDULED_WEEK) return { status: "failed", category: "historical_week_not_supported" };
      const findMissed = options.findMissed ?? ((date: string) => findMissedWeeklyDeliveries(получитьКлиентБазы(), date));
      const missed = await findMissed(start);
      if (missed.length) dependencies.logger.info("analytics_weekly_coverage_gap", { logicalIds: missed.map(({ logicalId }) => logicalId) });
      const historicalGaps = missed.filter(({ historical }) => historical);
      for (const { logicalId } of historicalGaps) {
        const reason = closures.get(logicalId);
        if (reason) dependencies.logger.info("analytics_historical_closed_without_replay", { logicalId, reason });
      }
      if (historicalGaps.some(({ logicalId }) => !closures.has(logicalId))) {
        return { status: "failed", category: "missed_week_reconciliation_required" };
      }
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
      const result = await runWeeklyAnalyticsDelivery({ now, dependencies: guarded, onlyIfAbsent: options.scheduledRetry });
      if (result.logicalId && result.logicalId !== expected) return { status: "failed", category: "weekly_identity_mismatch" };
      return result;
    }
    const guardedRetry = { ...dependencies, failureNotices: false,
      repositoryFactory: (config: Parameters<AnalyticsDeliveryDependencies["repositoryFactory"]>[0]) => {
        const repository = dependencies.repositoryFactory(config);
        return { ...repository,
          listDue: (at: Date, limit: number) => repository.listDue(at, limit, FIRST_SCHEDULED_WEEK),
          // Preserve W43 and existing evidence; retention is an explicit owner decision.
          cleanup: async () => 0,
        };
      },
    };
    const retry = await runAnalyticsDeliveryRetrySweep({ now, dependencies: guardedRetry });
    if (!options.scheduledRetry) return retry;
    let weeklyId: string;
    try {
      weeklyId = expectedWeeklyId(now);
    } catch {
      return retry; // A delayed Tuesday job must not generate last Monday's missing report.
    }
    const weekStart = buildReportWindows(now).windows.last7Days.startDate;
    if (weekStart < FIRST_SCHEDULED_WEEK || await readLedger(weeklyId, weekStart) !== "missing") return retry;

    // The same Monday's scheduled retry can recover a skipped job before it claimed a row.
    const weekly = await runDirectDelivery("weekly", { ...options, now });
    dependencies.logger.info("analytics_weekly_monday_fallback", {
      logicalId: weeklyId, status: weekly.status, category: weekly.category,
    });
    return ["noop", "sent", "partial_sent"].includes(retry.status) ? weekly : retry;
  } catch {
    return { status: "failed", category: "direct_execution_failed" };
  }
}
