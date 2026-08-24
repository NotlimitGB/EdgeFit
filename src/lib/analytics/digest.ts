import { createHash } from "node:crypto";
import type { AnalyticsReport } from "@/lib/analytics/reporting-server";

export const ANALYTICS_DIGEST_VERSION = "edgefit-digest-v1" as const;

const WINDOW_KEYS = [
  "yesterday",
  "last7Days",
  "previous7Days",
  "last30Days",
  "previous30Days",
] as const;
const ACQUISITION_GOAL_KEYS = [
  "quizStarted",
  "resultViewed",
  "productClicked",
] as const;
const TREND_KEYS = [
  "users",
  "visits",
  "quizCompletedSessions",
  "resultViewedSessions",
  "storeClickSessions",
] as const;
const PARTNER_COMPONENT_KEYS = [
  "traffic",
  "quizCompletions",
  "commerceClicks",
  "resultToStoreRate",
  "history",
] as const;
const MILLISECONDS_PER_DAY = 86_400_000;

type WindowKey = (typeof WINDOW_KEYS)[number];
type AcquisitionGoalKey = (typeof ACQUISITION_GOAL_KEYS)[number];
type DigestKind = "daily" | "weekly";

export interface AnalyticsDigestSourceStatus {
  status: "ok" | "not_configured" | "unavailable";
  diagnostic?: {
    category: string;
    httpStatus?: number;
  };
}

export interface AnalyticsDigestSamplingMetadata {
  status: "sampled" | "unsampled" | "unknown";
  sampleShare: number | null;
  sampleSize: number | null;
  sampleSpace: number | null;
  dataLag: number | null;
}

export interface AnalyticsDigestGoalMetric {
  users: number;
  visits: number;
  visitConversionRate: number;
  userConversionRate: number;
}

export interface AnalyticsDigest {
  version: typeof ANALYTICS_DIGEST_VERSION;
  kind: DigestKind;
  logicalId: string;
  generatedAt: string;
  asOfDate: string;
  timezone: "Europe/Moscow";
  status: "complete" | "partial";
  sourceReport: {
    version: string;
    evidenceHash: string;
  };
  periods: Record<WindowKey, { startDate: string; endDate: string }>;
  sourceStatus: {
    firstParty: AnalyticsDigestSourceStatus;
    metrika: AnalyticsDigestSourceStatus;
    acquisition: AnalyticsDigestSourceStatus;
  };
  traffic: Record<WindowKey, { users: number; visits: number } | null>;
  acquisition: {
    last7Days: { goals: Record<AcquisitionGoalKey, AnalyticsDigestGoalMetric> } | null;
    last30Days: { goals: Record<AcquisitionGoalKey, AnalyticsDigestGoalMetric> } | null;
    sources30Days: Array<{
      source: string;
      label: string;
      users: number;
      visits: number;
      goals: Record<AcquisitionGoalKey, AnalyticsDigestGoalMetric>;
    }>;
    landingPages30Days: Array<{
      path: string;
      users: number;
      visits: number;
      goals: Record<AcquisitionGoalKey, AnalyticsDigestGoalMetric>;
    }>;
    referralBreakdownStatus: AnalyticsDigestSourceStatus;
    referralBreakdown: Array<{
      domain: string | null;
      classification: "external_referral" | "self_referral" | "unknown_referral";
      users: number;
      visits: number;
      goals: Record<AcquisitionGoalKey, AnalyticsDigestGoalMetric>;
    }>;
    quizCompletionPolicy: {
      authority: "first_party_ordered_funnel";
      yandexGoalId: number;
      yandexStatus: "withheld_historical_contamination";
      cleanFrom: string;
    };
  };
  funnel: Record<
    WindowKey,
    {
      quizStartSessions: number;
      quizCompletedSessions: number;
      resultViewedSessions: number;
      resultToStoreSessions: number;
      storeClickSessions: number;
      quizCompletionRate: number | null;
      resultToStoreRate: number | null;
    }
  >;
  quizAbandonment: AnalyticsReport["quizAbandonment"];
  commerce: {
    windows: Record<WindowKey, { clickEvents: number; uniqueClickSessions: number }>;
    merchants30Days: Array<{
      merchant: string | null;
      clickEvents: number;
      uniqueClickSessions: number;
      shareOfClicks: number | null;
    }>;
    placements30Days: Array<{
      value: string | null;
      clickEvents: number;
      uniqueClickSessions: number;
      shareOfClicks: number | null;
    }>;
    topBoards30Days: Array<{
      boardSlug: string;
      clickEvents: number;
      uniqueClickSessions: number;
    }>;
    topOffers30Days: Array<{
      offerSlug: string;
      clickEvents: number;
      uniqueClickSessions: number;
      source: string | null;
      merchant: string | null;
    }>;
  };
  trends: {
    weekOverWeek: Record<
      (typeof TREND_KEYS)[number],
      { current: number; previous: number; absolute: number; percent: number | null }
    >;
    monthOverMonth: Record<
      (typeof TREND_KEYS)[number],
      { current: number; previous: number; absolute: number; percent: number | null }
    >;
  };
  partnerReadiness: AnalyticsReport["partnerReadiness"];
  dataQuality: Array<{ code: string; severity: "info" | "warning"; message: string }>;
  sampling: {
    traffic: Record<WindowKey, AnalyticsDigestSamplingMetadata | null> & {
      sources30Days: AnalyticsDigestSamplingMetadata | null;
    };
    acquisition: {
      last7Days: AnalyticsDigestSamplingMetadata | null;
      last30Days: AnalyticsDigestSamplingMetadata | null;
      sources30Days: AnalyticsDigestSamplingMetadata | null;
      landingPages30Days: AnalyticsDigestSamplingMetadata | null;
      referralBreakdown: AnalyticsDigestSamplingMetadata | null;
    };
  };
  delivery: {
    contentHash: string;
  };
}

export type AnalyticsDigestViolation = string;

export interface RelativeMovementEvidence {
  current: number;
  previous: number;
  absolute: number;
  relative: number;
  direction: "up" | "down";
}

interface RelativeMovementInput {
  current: number;
  previous: number;
  relativeThreshold: number;
  minimumBaseline: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeCanonicalValue(value: unknown, stack: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalization_invalid");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new Error("canonicalization_invalid");
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new Error("canonicalization_invalid");
  }
  if (stack.has(value)) {
    throw new Error("canonicalization_invalid");
  }

  stack.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeCanonicalValue(item, stack));
    }
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .map((key) => [key, normalizeCanonicalValue(value[key], stack)]),
    );
  } finally {
    stack.delete(value);
  }
}

export function canonicalizeAnalyticsDigest(value: unknown) {
  return JSON.stringify(normalizeCanonicalValue(value, new WeakSet()));
}

function hashCanonical(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(canonicalizeAnalyticsDigest(value), "utf8")
    .digest("hex")}`;
}

function projectSourceStatus(status: AnalyticsReport["sourceStatus"]["firstParty"]) {
  const diagnostic = status.diagnostic
    ? {
        category: status.diagnostic.category,
        ...(typeof status.diagnostic.httpStatus === "number" &&
        Number.isFinite(status.diagnostic.httpStatus)
          ? { httpStatus: status.diagnostic.httpStatus }
          : {}),
      }
    : undefined;

  return {
    status: status.status,
    ...(diagnostic ? { diagnostic } : {}),
  } satisfies AnalyticsDigestSourceStatus;
}

function projectSampling(
  sampling: AnalyticsDigestSamplingMetadata,
): AnalyticsDigestSamplingMetadata {
  return {
    status: sampling.status,
    sampleShare: sampling.sampleShare,
    sampleSize: sampling.sampleSize,
    sampleSpace: sampling.sampleSpace,
    dataLag: sampling.dataLag,
  };
}

function projectGoals(
  goals: Record<AcquisitionGoalKey, AnalyticsDigestGoalMetric>,
): Record<AcquisitionGoalKey, AnalyticsDigestGoalMetric> {
  return Object.fromEntries(
    ACQUISITION_GOAL_KEYS.map((key) => [
      key,
      {
        users: goals[key].users,
        visits: goals[key].visits,
        visitConversionRate: goals[key].visitConversionRate,
        userConversionRate: goals[key].userConversionRate,
      },
    ]),
  ) as Record<AcquisitionGoalKey, AnalyticsDigestGoalMetric>;
}

function projectPeriods(report: AnalyticsReport): AnalyticsDigest["periods"] {
  return Object.fromEntries(
    WINDOW_KEYS.map((key) => [
      key,
      {
        startDate: report.windows[key].startDate,
        endDate: report.windows[key].endDate,
      },
    ]),
  ) as AnalyticsDigest["periods"];
}

function projectTraffic(report: AnalyticsReport): AnalyticsDigest["traffic"] {
  return Object.fromEntries(
    WINDOW_KEYS.map((key) => {
      const window = report.traffic[key];
      return [key, window ? { users: window.users, visits: window.visits } : null];
    }),
  ) as AnalyticsDigest["traffic"];
}

function projectAcquisition(report: AnalyticsReport): AnalyticsDigest["acquisition"] {
  const projectWindow = (window: AnalyticsReport["acquisition"]["last7Days"]) =>
    window ? { goals: projectGoals(window.goals) } : null;

  return {
    last7Days: projectWindow(report.acquisition.last7Days),
    last30Days: projectWindow(report.acquisition.last30Days),
    sources30Days: report.acquisition.sources30Days.map((row) => ({
      source: row.source,
      label: row.label,
      users: row.users,
      visits: row.visits,
      goals: projectGoals(row.goals),
    })),
    landingPages30Days: report.acquisition.landingPages30Days.map((row) => ({
      path: row.path,
      users: row.users,
      visits: row.visits,
      goals: projectGoals(row.goals),
    })),
    referralBreakdownStatus: projectSourceStatus(
      report.acquisition.referralBreakdownStatus,
    ),
    referralBreakdown: report.acquisition.referralBreakdown.map((row) => ({
      domain: row.domain,
      classification: row.classification,
      users: row.users,
      visits: row.visits,
      goals: projectGoals(row.goals),
    })),
    quizCompletionPolicy: {
      authority: report.acquisition.quizCompletionPolicy.authority,
      yandexGoalId: report.acquisition.quizCompletionPolicy.yandexGoalId,
      yandexStatus: report.acquisition.quizCompletionPolicy.yandexStatus,
      cleanFrom: report.acquisition.quizCompletionPolicy.cleanFrom,
    },
  };
}

function projectFunnel(report: AnalyticsReport): AnalyticsDigest["funnel"] {
  return Object.fromEntries(
    WINDOW_KEYS.map((key) => {
      const value = report.funnel[key];
      return [
        key,
        {
          quizStartSessions: value.quizStartSessions,
          quizCompletedSessions: value.quizCompletedSessions,
          resultViewedSessions: value.resultViewedSessions,
          resultToStoreSessions: value.resultToStoreSessions,
          storeClickSessions: value.storeClickSessions,
          quizCompletionRate: value.quizCompletionRate,
          resultToStoreRate: value.resultToStoreRate,
        },
      ];
    }),
  ) as AnalyticsDigest["funnel"];
}

function projectCommerce(report: AnalyticsReport): AnalyticsDigest["commerce"] {
  return {
    windows: Object.fromEntries(
      WINDOW_KEYS.map((key) => [
        key,
        {
          clickEvents: report.commerce.windows[key].clickEvents,
          uniqueClickSessions: report.commerce.windows[key].uniqueClickSessions,
        },
      ]),
    ) as AnalyticsDigest["commerce"]["windows"],
    merchants30Days: report.commerce.merchants30Days.map((row) => ({
      merchant: row.merchant,
      clickEvents: row.clickEvents,
      uniqueClickSessions: row.uniqueClickSessions,
      shareOfClicks: row.shareOfClicks,
    })),
    placements30Days: report.commerce.placements30Days.map((row) => ({
      value: row.value,
      clickEvents: row.clickEvents,
      uniqueClickSessions: row.uniqueClickSessions,
      shareOfClicks: row.shareOfClicks,
    })),
    topBoards30Days: report.commerce.topBoards30Days.map((row) => ({
      boardSlug: row.boardSlug,
      clickEvents: row.clickEvents,
      uniqueClickSessions: row.uniqueClickSessions,
    })),
    topOffers30Days: report.commerce.topOffers30Days.map((row) => ({
      offerSlug: row.offerSlug,
      clickEvents: row.clickEvents,
      uniqueClickSessions: row.uniqueClickSessions,
      source: row.source,
      merchant: row.merchant,
    })),
  };
}

function projectTrends(report: AnalyticsReport): AnalyticsDigest["trends"] {
  const projectGroup = (group: AnalyticsReport["trends"]["weekOverWeek"]) =>
    Object.fromEntries(
      TREND_KEYS.map((key) => [
        key,
        {
          current: group[key].current,
          previous: group[key].previous,
          absolute: group[key].absolute,
          percent: group[key].percent,
        },
      ]),
    ) as AnalyticsDigest["trends"]["weekOverWeek"];

  return {
    weekOverWeek: projectGroup(report.trends.weekOverWeek),
    monthOverMonth: projectGroup(report.trends.monthOverMonth),
  };
}

function projectPartnerReadiness(
  report: AnalyticsReport,
): AnalyticsDigest["partnerReadiness"] {
  const readiness = report.partnerReadiness;
  const components = Object.fromEntries(
    PARTNER_COMPONENT_KEYS.map((key) => [
      key,
      {
        value: readiness.components[key].value,
        target: readiness.components[key].target,
        points: readiness.components[key].points,
        maxPoints: readiness.components[key].maxPoints,
      },
    ]),
  ) as AnalyticsDigest["partnerReadiness"]["components"];

  return {
    score: readiness.score,
    status: readiness.status,
    strictOutreachReady: readiness.strictOutreachReady,
    components,
    thresholds: {
      trafficUsers30d: readiness.thresholds.trafficUsers30d,
      quizCompletedSessions30d: readiness.thresholds.quizCompletedSessions30d,
      storeClickSessions30d: readiness.thresholds.storeClickSessions30d,
      resultToStoreRate30d: readiness.thresholds.resultToStoreRate30d,
      firstPartyHistoryDays: readiness.thresholds.firstPartyHistoryDays,
    },
    failingMetrics: readiness.failingMetrics.map((value) => value),
    manualChecks: readiness.manualChecks.map((check) => ({
      id: check.id,
      status: check.status,
    })),
  };
}

function projectSamplingEvidence(report: AnalyticsReport): AnalyticsDigest["sampling"] {
  const traffic = Object.fromEntries(
    WINDOW_KEYS.map((key) => [
      key,
      report.traffic[key] ? projectSampling(report.traffic[key]!.sampling) : null,
    ]),
  ) as Record<WindowKey, AnalyticsDigestSamplingMetadata | null>;

  return {
    traffic: {
      ...traffic,
      sources30Days:
        report.sourceStatus.metrika.status === "ok"
          ? projectSampling(report.traffic.sourcesSampling)
          : null,
    },
    acquisition: {
      last7Days: report.acquisition.last7Days
        ? projectSampling(report.acquisition.last7Days.sampling)
        : null,
      last30Days: report.acquisition.last30Days
        ? projectSampling(report.acquisition.last30Days.sampling)
        : null,
      sources30Days:
        report.acquisition.sourceStatus.status === "ok"
          ? projectSampling(report.acquisition.sourcesSampling)
          : null,
      landingPages30Days:
        report.acquisition.sourceStatus.status === "ok"
          ? projectSampling(report.acquisition.landingPagesSampling)
          : null,
      referralBreakdown:
        report.acquisition.referralBreakdownStatus.status === "ok"
          ? projectSampling(report.acquisition.referralSampling)
          : null,
    },
  };
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) {
    return null;
  }
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function addDays(value: string, days: number) {
  const date = parseDateOnly(value);
  if (!date) {
    return null;
  }
  return new Date(date.getTime() + days * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function isSevenDayMondayToSunday(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  return Boolean(
    start &&
      end &&
      start.getUTCDay() === 1 &&
      end.getUTCDay() === 0 &&
      end.getTime() - start.getTime() === 6 * MILLISECONDS_PER_DAY,
  );
}

function validateWeeklyPeriods(report: AnalyticsReport) {
  const current = report.windows.last7Days;
  const previous = report.windows.previous7Days;
  const asOf = parseDateOnly(report.asOfDate);
  const valid =
    asOf?.getUTCDay() === 0 &&
    report.asOfDate === current.endDate &&
    isSevenDayMondayToSunday(current.startDate, current.endDate) &&
    isSevenDayMondayToSunday(previous.startDate, previous.endDate) &&
    addDays(previous.endDate, 1) === current.startDate;

  if (!valid) {
    throw new Error("weekly_period_invalid");
  }
}

function getIsoWeekIdentity(asOfDate: string) {
  const date = parseDateOnly(asOfDate);
  if (!date) {
    throw new Error("weekly_period_invalid");
  }
  const isoDay = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoDay);
  const weekYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / MILLISECONDS_PER_DAY + 1) / 7,
  );
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

type Schema =
  | { type: "string"; values?: readonly string[]; validate?: (value: string) => boolean }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "nullable"; schema: Schema }
  | { type: "array"; items: Schema }
  | { type: "object"; fields: Record<string, { schema: Schema; optional?: boolean }> };

const stringSchema = (options: Omit<Extract<Schema, { type: "string" }>, "type"> = {}): Schema => ({
  type: "string",
  ...options,
});
const numberSchema: Schema = { type: "number" };
const nullableNumberSchema: Schema = { type: "nullable", schema: numberSchema };
const dateSchema = stringSchema({ validate: (value) => Boolean(parseDateOnly(value)) });
const hashSchema = stringSchema({ validate: (value) => /^sha256:[a-f0-9]{64}$/u.test(value) });
const samplingSchema: Schema = {
  type: "object",
  fields: {
    status: { schema: stringSchema({ values: ["sampled", "unsampled", "unknown"] }) },
    sampleShare: { schema: nullableNumberSchema },
    sampleSize: { schema: nullableNumberSchema },
    sampleSpace: { schema: nullableNumberSchema },
    dataLag: { schema: nullableNumberSchema },
  },
};
const goalMetricSchema: Schema = {
  type: "object",
  fields: {
    users: { schema: numberSchema },
    visits: { schema: numberSchema },
    visitConversionRate: { schema: numberSchema },
    userConversionRate: { schema: numberSchema },
  },
};
const goalsSchema: Schema = {
  type: "object",
  fields: Object.fromEntries(
    ACQUISITION_GOAL_KEYS.map((key) => [key, { schema: goalMetricSchema }]),
  ),
};
const sourceStatusSchema: Schema = {
  type: "object",
  fields: {
    status: { schema: stringSchema({ values: ["ok", "not_configured", "unavailable"] }) },
    diagnostic: {
      optional: true,
      schema: {
        type: "object",
        fields: {
          category: { schema: stringSchema() },
          httpStatus: { schema: numberSchema, optional: true },
        },
      },
    },
  },
};
const periodSchema: Schema = {
  type: "object",
  fields: { startDate: { schema: dateSchema }, endDate: { schema: dateSchema } },
};
const trafficWindowSchema: Schema = {
  type: "object",
  fields: { users: { schema: numberSchema }, visits: { schema: numberSchema } },
};
const funnelWindowSchema: Schema = {
  type: "object",
  fields: {
    quizStartSessions: { schema: numberSchema },
    quizCompletedSessions: { schema: numberSchema },
    resultViewedSessions: { schema: numberSchema },
    resultToStoreSessions: { schema: numberSchema },
    storeClickSessions: { schema: numberSchema },
    quizCompletionRate: { schema: nullableNumberSchema },
    resultToStoreRate: { schema: nullableNumberSchema },
  },
};
const commerceWindowSchema: Schema = {
  type: "object",
  fields: {
    clickEvents: { schema: numberSchema },
    uniqueClickSessions: { schema: numberSchema },
  },
};
const trendMetricSchema: Schema = {
  type: "object",
  fields: {
    current: { schema: numberSchema },
    previous: { schema: numberSchema },
    absolute: { schema: numberSchema },
    percent: { schema: nullableNumberSchema },
  },
};
const trendGroupSchema: Schema = {
  type: "object",
  fields: Object.fromEntries(TREND_KEYS.map((key) => [key, { schema: trendMetricSchema }])),
};
const partnerComponentSchema: Schema = {
  type: "object",
  fields: {
    value: { schema: nullableNumberSchema },
    target: { schema: numberSchema },
    points: { schema: nullableNumberSchema },
    maxPoints: { schema: numberSchema },
  },
};
const digestSchema: Schema = {
  type: "object",
  fields: {
    version: { schema: stringSchema({ values: [ANALYTICS_DIGEST_VERSION] }) },
    kind: { schema: stringSchema({ values: ["daily", "weekly"] }) },
    logicalId: { schema: stringSchema() },
    generatedAt: {
      schema: stringSchema({
        validate: (value) => {
          const parsed = Date.parse(value);
          return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
        },
      }),
    },
    asOfDate: { schema: dateSchema },
    timezone: { schema: stringSchema({ values: ["Europe/Moscow"] }) },
    status: { schema: stringSchema({ values: ["complete", "partial"] }) },
    sourceReport: {
      schema: {
        type: "object",
        fields: {
          version: { schema: stringSchema() },
          evidenceHash: { schema: hashSchema },
        },
      },
    },
    periods: {
      schema: {
        type: "object",
        fields: Object.fromEntries(WINDOW_KEYS.map((key) => [key, { schema: periodSchema }])),
      },
    },
    sourceStatus: {
      schema: {
        type: "object",
        fields: {
          firstParty: { schema: sourceStatusSchema },
          metrika: { schema: sourceStatusSchema },
          acquisition: { schema: sourceStatusSchema },
        },
      },
    },
    traffic: {
      schema: {
        type: "object",
        fields: Object.fromEntries(
          WINDOW_KEYS.map((key) => [
            key,
            { schema: { type: "nullable", schema: trafficWindowSchema } satisfies Schema },
          ]),
        ),
      },
    },
    acquisition: {
      schema: {
        type: "object",
        fields: {
          last7Days: {
            schema: {
              type: "nullable",
              schema: { type: "object", fields: { goals: { schema: goalsSchema } } },
            },
          },
          last30Days: {
            schema: {
              type: "nullable",
              schema: { type: "object", fields: { goals: { schema: goalsSchema } } },
            },
          },
          sources30Days: {
            schema: {
              type: "array",
              items: {
                type: "object",
                fields: {
                  source: { schema: stringSchema() },
                  label: { schema: stringSchema() },
                  users: { schema: numberSchema },
                  visits: { schema: numberSchema },
                  goals: { schema: goalsSchema },
                },
              },
            },
          },
          landingPages30Days: {
            schema: {
              type: "array",
              items: {
                type: "object",
                fields: {
                  path: {
                    schema: stringSchema({
                      validate: (value) =>
                        value.startsWith("/") &&
                        !value.startsWith("//") &&
                        !value.includes("?") &&
                        !value.includes("#"),
                    }),
                  },
                  users: { schema: numberSchema },
                  visits: { schema: numberSchema },
                  goals: { schema: goalsSchema },
                },
              },
            },
          },
          referralBreakdownStatus: { schema: sourceStatusSchema },
          referralBreakdown: {
            schema: {
              type: "array",
              items: {
                type: "object",
                fields: {
                  domain: { schema: { type: "nullable", schema: stringSchema() } },
                  classification: {
                    schema: stringSchema({
                      values: [
                        "external_referral",
                        "self_referral",
                        "unknown_referral",
                      ],
                    }),
                  },
                  users: { schema: numberSchema },
                  visits: { schema: numberSchema },
                  goals: { schema: goalsSchema },
                },
              },
            },
          },
          quizCompletionPolicy: {
            schema: {
              type: "object",
              fields: {
                authority: {
                  schema: stringSchema({ values: ["first_party_ordered_funnel"] }),
                },
                yandexGoalId: { schema: numberSchema },
                yandexStatus: {
                  schema: stringSchema({ values: ["withheld_historical_contamination"] }),
                },
                cleanFrom: { schema: dateSchema },
              },
            },
          },
        },
      },
    },
    funnel: {
      schema: {
        type: "object",
        fields: Object.fromEntries(
          WINDOW_KEYS.map((key) => [key, { schema: funnelWindowSchema }]),
        ),
      },
    },
    quizAbandonment: {
      schema: {
        type: "object",
        fields: {
          availableFrom: { schema: { type: "nullable", schema: stringSchema() } },
          windows: {
            schema: {
              type: "object",
              fields: Object.fromEntries(
                WINDOW_KEYS.map((key) => [
                  key,
                  {
                    schema: {
                      type: "object",
                      fields: {
                        versions: {
                          schema: {
                            type: "array",
                            items: {
                              type: "object",
                              fields: {
                                quizVersion: { schema: stringSchema() },
                                quizStartSessions: { schema: numberSchema },
                                quizCompletedSessions: { schema: numberSchema },
                                steps: {
                                  schema: {
                                    type: "array",
                                    items: {
                                      type: "object",
                                      fields: {
                                        stepIndex: { schema: numberSchema },
                                        stepKey: { schema: stringSchema() },
                                        totalSteps: { schema: numberSchema },
                                        completedStepSessions: { schema: numberSchema },
                                        abandonedAfterStepSessions: { schema: numberSchema },
                                        stepToNextConversionRate: {
                                          schema: nullableNumberSchema,
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ]),
              ),
            },
          },
        },
      },
    },
    commerce: {
      schema: {
        type: "object",
        fields: {
          windows: {
            schema: {
              type: "object",
              fields: Object.fromEntries(
                WINDOW_KEYS.map((key) => [key, { schema: commerceWindowSchema }]),
              ),
            },
          },
          merchants30Days: {
            schema: {
              type: "array",
              items: {
                type: "object",
                fields: {
                  merchant: { schema: { type: "nullable", schema: stringSchema() } },
                  clickEvents: { schema: numberSchema },
                  uniqueClickSessions: { schema: numberSchema },
                  shareOfClicks: { schema: nullableNumberSchema },
                },
              },
            },
          },
          placements30Days: {
            schema: {
              type: "array",
              items: {
                type: "object",
                fields: {
                  value: { schema: { type: "nullable", schema: stringSchema() } },
                  clickEvents: { schema: numberSchema },
                  uniqueClickSessions: { schema: numberSchema },
                  shareOfClicks: { schema: nullableNumberSchema },
                },
              },
            },
          },
          topBoards30Days: {
            schema: {
              type: "array",
              items: {
                type: "object",
                fields: {
                  boardSlug: { schema: stringSchema() },
                  clickEvents: { schema: numberSchema },
                  uniqueClickSessions: { schema: numberSchema },
                },
              },
            },
          },
          topOffers30Days: {
            schema: {
              type: "array",
              items: {
                type: "object",
                fields: {
                  offerSlug: { schema: stringSchema() },
                  clickEvents: { schema: numberSchema },
                  uniqueClickSessions: { schema: numberSchema },
                  source: { schema: { type: "nullable", schema: stringSchema() } },
                  merchant: { schema: { type: "nullable", schema: stringSchema() } },
                },
              },
            },
          },
        },
      },
    },
    trends: {
      schema: {
        type: "object",
        fields: {
          weekOverWeek: { schema: trendGroupSchema },
          monthOverMonth: { schema: trendGroupSchema },
        },
      },
    },
    partnerReadiness: {
      schema: {
        type: "object",
        fields: {
          score: { schema: nullableNumberSchema },
          status: {
            schema: stringSchema({
              values: [
                "insufficient_data",
                "early",
                "building_evidence",
                "approaching",
                "metric_ready",
              ],
            }),
          },
          strictOutreachReady: { schema: { type: "boolean" } },
          components: {
            schema: {
              type: "object",
              fields: Object.fromEntries(
                PARTNER_COMPONENT_KEYS.map((key) => [key, { schema: partnerComponentSchema }]),
              ),
            },
          },
          thresholds: {
            schema: {
              type: "object",
              fields: {
                trafficUsers30d: { schema: numberSchema },
                quizCompletedSessions30d: { schema: numberSchema },
                storeClickSessions30d: { schema: numberSchema },
                resultToStoreRate30d: { schema: numberSchema },
                firstPartyHistoryDays: { schema: numberSchema },
              },
            },
          },
          failingMetrics: { schema: { type: "array", items: stringSchema() } },
          manualChecks: {
            schema: {
              type: "array",
              items: {
                type: "object",
                fields: {
                  id: { schema: stringSchema() },
                  status: { schema: stringSchema({ values: ["NOT_OBSERVABLE"] }) },
                },
              },
            },
          },
        },
      },
    },
    dataQuality: {
      schema: {
        type: "array",
        items: {
          type: "object",
          fields: {
            code: { schema: stringSchema() },
            severity: { schema: stringSchema({ values: ["info", "warning"] }) },
            message: { schema: stringSchema() },
          },
        },
      },
    },
    sampling: {
      schema: {
        type: "object",
        fields: {
          traffic: {
            schema: {
              type: "object",
              fields: {
                ...Object.fromEntries(
                  WINDOW_KEYS.map((key) => [
                    key,
                    { schema: { type: "nullable", schema: samplingSchema } satisfies Schema },
                  ]),
                ),
                sources30Days: {
                  schema: { type: "nullable", schema: samplingSchema },
                },
              },
            },
          },
          acquisition: {
            schema: {
              type: "object",
              fields: {
                last7Days: { schema: { type: "nullable", schema: samplingSchema } },
                last30Days: { schema: { type: "nullable", schema: samplingSchema } },
                sources30Days: { schema: { type: "nullable", schema: samplingSchema } },
                landingPages30Days: {
                  schema: { type: "nullable", schema: samplingSchema },
                },
                referralBreakdown: {
                  schema: { type: "nullable", schema: samplingSchema },
                },
              },
            },
          },
        },
      },
    },
    delivery: {
      schema: {
        type: "object",
        fields: { contentHash: { schema: hashSchema } },
      },
    },
  },
};

function validateSchema(
  value: unknown,
  schema: Schema,
  path: string,
  violations: Set<string>,
  stack = new WeakSet<object>(),
) {
  if (schema.type === "nullable") {
    if (value === null) {
      return;
    }
    validateSchema(value, schema.schema, path, violations, stack);
    return;
  }
  if (schema.type === "string") {
    if (
      typeof value !== "string" ||
      (schema.values && !schema.values.includes(value)) ||
      (schema.validate && !schema.validate(value))
    ) {
      violations.add(`schema:${path}:invalid_string`);
    }
    return;
  }
  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      violations.add(`schema:${path}:invalid_number`);
    }
    return;
  }
  if (schema.type === "boolean") {
    if (typeof value !== "boolean") {
      violations.add(`schema:${path}:invalid_boolean`);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      violations.add(`schema:${path}:invalid_array`);
      return;
    }
    if (stack.has(value)) {
      violations.add(`schema:${path}:cyclic_value`);
      return;
    }
    stack.add(value);
    value.forEach((item, index) =>
      validateSchema(item, schema.items, `${path}[${index}]`, violations, stack),
    );
    stack.delete(value);
    return;
  }
  if (!isPlainObject(value)) {
    violations.add(`schema:${path}:invalid_object`);
    return;
  }
  if (stack.has(value)) {
    violations.add(`schema:${path}:cyclic_value`);
    return;
  }
  stack.add(value);

  const allowedKeys = new Set(Object.keys(schema.fields));
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      violations.add(`schema:${path}.${key}:unknown_key`);
    }
  }
  for (const [key, field] of Object.entries(schema.fields)) {
    const nestedPath = `${path}.${key}`;
    if (!(key in value)) {
      if (!field.optional) {
        violations.add(`schema:${nestedPath}:missing_key`);
      }
      continue;
    }
    validateSchema(value[key], field.schema, nestedPath, violations, stack);
  }
  stack.delete(value);
}

const FORBIDDEN_NORMALIZED_KEYS = new Set([
  "sessionid",
  "userid",
  "visitorid",
  "email",
  "phone",
  "name",
  "height",
  "heightcm",
  "weight",
  "weightkg",
  "bootsize",
  "bootsizeeu",
  "stance",
  "destinationurl",
  "url",
  "payload",
  "rawpayload",
  "rawquizpayload",
  "quizanswers",
  "authorization",
  "authorizationheader",
  "token",
  "oauthtoken",
  "secret",
  "password",
  "cookie",
  "databaseurl",
  "cronsecret",
  "resendapikey",
  "recipient",
  "sender",
]);

function normalizeKey(key: string) {
  return key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function findPrivacyViolations(
  value: unknown,
  path: string,
  violations: Set<string>,
  visited: WeakSet<object>,
) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^https?:\/\//iu.test(trimmed)) {
      violations.add(`privacy:${path}:full_url`);
    }
    if (/^postgres(?:ql)?:\/\//iu.test(trimmed)) {
      violations.add(`privacy:${path}:database_url`);
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed)) {
      violations.add(`privacy:${path}:email_value`);
    }
    if (/^bearer\s+\S+/iu.test(trimmed)) {
      violations.add(`privacy:${path}:authorization_value`);
    }
    return;
  }
  if (!value || typeof value !== "object" || visited.has(value)) {
    return;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findPrivacyViolations(item, `${path}[${index}]`, violations, visited),
    );
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (FORBIDDEN_NORMALIZED_KEYS.has(normalizeKey(key))) {
      violations.add(`privacy:${nestedPath}:forbidden_key`);
    }
    findPrivacyViolations(nested, nestedPath, violations, visited);
  }
}

export function getAnalyticsDigestPrivacyViolations(
  value: unknown,
): AnalyticsDigestViolation[] {
  const violations = new Set<string>();
  validateSchema(value, digestSchema, "$", violations);
  findPrivacyViolations(value, "$", violations, new WeakSet());
  return [...violations].sort((left, right) => left.localeCompare(right));
}

function validateCompletedDigest(digest: AnalyticsDigest) {
  const violations = getAnalyticsDigestPrivacyViolations(digest);
  if (violations.some((violation) => violation.startsWith("privacy:"))) {
    throw new Error("digest_privacy_violation");
  }
  if (violations.length > 0) {
    throw new Error("digest_schema_invalid");
  }
}

function buildAnalyticsDigest(report: AnalyticsReport, kind: DigestKind): AnalyticsDigest {
  if (report.timezone !== "Europe/Moscow") {
    throw new Error("digest_schema_invalid");
  }
  if (kind === "weekly") {
    validateWeeklyPeriods(report);
  }

  const periods = projectPeriods(report);
  const sourceStatus = {
    firstParty: projectSourceStatus(report.sourceStatus.firstParty),
    metrika: projectSourceStatus(report.sourceStatus.metrika),
    acquisition: projectSourceStatus(report.acquisition.sourceStatus),
  };
  const traffic = projectTraffic(report);
  const acquisition = projectAcquisition(report);
  const funnel = projectFunnel(report);
  const quizAbandonment = report.quizAbandonment;
  const commerce = projectCommerce(report);
  const trends = projectTrends(report);
  const partnerReadiness = projectPartnerReadiness(report);
  const dataQuality = report.dataQuality.map((warning) => ({
    code: warning.code,
    severity: warning.severity,
    message: warning.message,
  }));
  const sampling = projectSamplingEvidence(report);
  const status =
    sourceStatus.firstParty.status === "ok" &&
    sourceStatus.metrika.status === "ok" &&
    sourceStatus.acquisition.status === "ok"
      ? "complete"
      : "partial";
  const logicalId =
    kind === "daily"
      ? `daily:${report.asOfDate}`
      : `weekly:${getIsoWeekIdentity(report.asOfDate)}`;

  const projectedEvidence = {
    asOfDate: report.asOfDate,
    timezone: "Europe/Moscow" as const,
    periods,
    sourceStatus,
    traffic,
    acquisition,
    funnel,
    quizAbandonment,
    commerce,
    trends,
    partnerReadiness,
    dataQuality,
    sampling,
  };
  const evidenceHash = hashCanonical({
    sourceReportVersion: report.version,
    ...projectedEvidence,
  });
  const contentHash = hashCanonical({
    version: ANALYTICS_DIGEST_VERSION,
    kind,
    logicalId,
    status,
    sourceReport: { version: report.version, evidenceHash },
    ...projectedEvidence,
  });
  const digest: AnalyticsDigest = {
    version: ANALYTICS_DIGEST_VERSION,
    kind,
    logicalId,
    generatedAt: report.generatedAt,
    asOfDate: report.asOfDate,
    timezone: "Europe/Moscow",
    status,
    sourceReport: { version: report.version, evidenceHash },
    periods,
    sourceStatus,
    traffic,
    acquisition,
    funnel,
    quizAbandonment,
    commerce,
    trends,
    partnerReadiness,
    dataQuality,
    sampling,
    delivery: { contentHash },
  };

  validateCompletedDigest(digest);
  return digest;
}

export function buildDailyAnalyticsDigest(report: AnalyticsReport) {
  return buildAnalyticsDigest(report, "daily");
}

export function buildWeeklyAnalyticsDigest(report: AnalyticsReport) {
  return buildAnalyticsDigest(report, "weekly");
}

export function getRelativeMovementEvidence({
  current,
  previous,
  relativeThreshold,
  minimumBaseline,
}: RelativeMovementInput): RelativeMovementEvidence | null {
  if (
    ![current, previous, relativeThreshold, minimumBaseline].every(Number.isFinite) ||
    relativeThreshold < 0 ||
    minimumBaseline < 0 ||
    previous === 0 ||
    Math.abs(previous) < minimumBaseline
  ) {
    return null;
  }
  const absolute = current - previous;
  if (absolute === 0) {
    return null;
  }
  const relative = absolute / Math.abs(previous);
  if (Math.abs(relative) < relativeThreshold) {
    return null;
  }
  return {
    current,
    previous,
    absolute,
    relative,
    direction: absolute > 0 ? "up" : "down",
  };
}
