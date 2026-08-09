export const ANALYTICS_REPORT_VERSION = "edgefit-analytics-report-v1";
export const ANALYTICS_REPORT_TIMEZONE = "Europe/Moscow";

export const reportWindowKeys = [
  "yesterday",
  "last7Days",
  "previous7Days",
  "last30Days",
  "previous30Days",
] as const;

export type ReportWindowKey = (typeof reportWindowKeys)[number];

export interface ReportWindow {
  startDate: string;
  endDate: string;
}

export type ReportWindows = Record<ReportWindowKey, ReportWindow>;

export interface EventMetric {
  eventCount: number;
  uniqueSessions: number;
}

export const reportedEventNames = [
  "home_viewed",
  "quiz_started",
  "quiz_completed",
  "result_viewed",
  "product_clicked",
  "email_submitted",
] as const;

export type ReportedEventName = (typeof reportedEventNames)[number];
export type EventMetrics = Record<ReportedEventName, EventMetric>;

export interface FunnelAggregateInput {
  quizStartSessions: number;
  quizCompletedSessions: number;
  resultViewedSessions: number;
  resultToStoreSessions: number;
  storeClickSessions: number;
}

export interface FunnelMetrics extends FunnelAggregateInput {
  quizCompletionRate: number | null;
  resultToStoreRate: number | null;
}

export interface CommerceMetrics {
  clickEvents: number;
  uniqueClickSessions: number;
}

export interface SamplingMetadata {
  status: "sampled" | "unsampled" | "unknown";
  sampleShare: number | null;
  sampleSize: number | null;
  sampleSpace: number | null;
  dataLag: number | null;
}

export interface TrafficMetrics {
  users: number;
  visits: number;
  bounceRate: number;
  pageDepth: number;
  avgVisitDurationSeconds: number;
  sampling: SamplingMetadata;
}

export interface TrafficSourceMetric {
  source: string;
  label: string;
  visits: number;
  users: number;
  share: number | null;
}

export interface TrendDelta {
  current: number;
  previous: number;
  absolute: number;
  percent: number | null;
}

export interface SourceDiagnostic {
  category: string;
  httpStatus?: number;
}

export type AnalyticsSourceState = "ok" | "not_configured" | "unavailable";

export interface AnalyticsSourceStatus {
  status: AnalyticsSourceState;
  diagnostic?: SourceDiagnostic;
}

export interface CommerceBreakdownItem {
  value: string | null;
  clickEvents: number;
  uniqueClickSessions: number;
  shareOfClicks: number | null;
}

export interface MerchantEvidence extends CommerceBreakdownItem {
  merchant: string | null;
  topBoards: Array<{ boardSlug: string; clickEvents: number }>;
  topOffers: Array<{ offerSlug: string; clickEvents: number }>;
  topSizes: Array<{ sizeLabel: string; clickEvents: number }>;
}

export interface TopBoardMetric {
  boardSlug: string;
  clickEvents: number;
  uniqueClickSessions: number;
}

export interface TopOfferMetric {
  offerSlug: string;
  clickEvents: number;
  uniqueClickSessions: number;
  source: string | null;
  merchant: string | null;
}

export interface DataQualityWarning {
  code: string;
  severity: "info" | "warning";
  message: string;
}

const forbiddenReportKeys = new Set([
  "sessionId",
  "session_id",
  "email",
  "phone",
  "destination_url",
  "payload",
  "rawPayload",
  "weight_kg",
  "height_cm",
  "boot_size_eu",
  "stance",
]);

export function getAnalyticsReportPrivacyViolations(value: unknown) {
  const violations = new Set<string>();

  const visit = (current: unknown, path: string) => {
    if (typeof current === "string") {
      if (/^https?:\/\//iu.test(current.trim())) {
        violations.add(`${path}:url`);
      }
      return;
    }
    if (!current || typeof current !== "object") {
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    for (const [key, nestedValue] of Object.entries(current)) {
      const nestedPath = path ? `${path}.${key}` : key;
      if (forbiddenReportKeys.has(key)) {
        violations.add(nestedPath);
      }
      visit(nestedValue, nestedPath);
    }
  };

  visit(value, "");
  return [...violations].sort();
}

export const partnerReadinessThresholds = {
  trafficUsers30d: 10_000,
  quizCompletedSessions30d: 1_000,
  storeClickSessions30d: 300,
  resultToStoreRate30d: 0.1,
  firstPartyHistoryDays: 60,
} as const;

const partnerWeights = {
  traffic: 25,
  quizCompletions: 20,
  commerceClicks: 25,
  resultToStoreRate: 20,
  history: 10,
} as const;

export type PartnerReadinessStatus =
  | "insufficient_data"
  | "early"
  | "building_evidence"
  | "approaching"
  | "metric_ready";

export interface PartnerReadinessComponent {
  value: number | null;
  target: number;
  points: number | null;
  maxPoints: number;
}

export interface PartnerReadiness {
  score: number | null;
  status: PartnerReadinessStatus;
  strictOutreachReady: boolean;
  components: {
    traffic: PartnerReadinessComponent;
    quizCompletions: PartnerReadinessComponent;
    commerceClicks: PartnerReadinessComponent;
    resultToStoreRate: PartnerReadinessComponent;
    history: PartnerReadinessComponent;
  };
  thresholds: typeof partnerReadinessThresholds;
  failingMetrics: string[];
  manualChecks: Array<{
    id: string;
    status: "NOT_OBSERVABLE";
  }>;
}

export interface PartnerReadinessInput {
  users30d: number | null;
  quizCompletedSessions30d: number | null;
  storeClickSessions30d: number | null;
  resultToStoreRate30d: number | null;
  firstPartyHistoryDays: number | null;
}

export interface SessionTimelineEvent {
  eventName: string;
  createdAt: Date | string | number;
}

function round(value: number, digits: number) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function parseIsoDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) {
    throw new Error(`Invalid ISO date: ${date}`);
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function addCalendarDays(date: string, days: number) {
  const value = parseIsoDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getMoscowCalendarDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function buildReportWindows(now = new Date()) {
  const asOfDate = addCalendarDays(getMoscowCalendarDate(now), -1);
  const window = (startOffset: number, endOffset: number): ReportWindow => ({
    startDate: addCalendarDays(asOfDate, startOffset),
    endDate: addCalendarDays(asOfDate, endOffset),
  });

  return {
    asOfDate,
    windows: {
      yesterday: window(0, 0),
      last7Days: window(-6, 0),
      previous7Days: window(-13, -7),
      last30Days: window(-29, 0),
      previous30Days: window(-59, -30),
    } satisfies ReportWindows,
  };
}

export function calculateRate(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }

  return round(Math.min(Math.max(numerator / denominator, 0), 1), 4);
}

export function buildFunnelMetrics(input: FunnelAggregateInput): FunnelMetrics {
  return {
    ...input,
    quizCompletionRate: calculateRate(
      input.quizCompletedSessions,
      input.quizStartSessions,
    ),
    resultToStoreRate: calculateRate(
      input.resultToStoreSessions,
      input.resultViewedSessions,
    ),
  };
}

export function calculateTrend(current: number, previous: number): TrendDelta {
  return {
    current,
    previous,
    absolute: current - previous,
    percent: previous === 0 ? null : round((current - previous) / previous, 4),
  };
}

export function evaluateSessionTimeline(events: readonly SessionTimelineEvent[]) {
  const normalized = events
    .map((event) => ({ ...event, timestamp: new Date(event.createdAt).getTime() }))
    .filter((event) => Number.isFinite(event.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
  const quizStartedAt = normalized.find(
    (event) => event.eventName === "quiz_started",
  )?.timestamp;
  const resultViewedAt = normalized.find(
    (event) => event.eventName === "result_viewed",
  )?.timestamp;

  return {
    hasQuizStart: quizStartedAt !== undefined,
    hasOrderedQuizCompletion:
      quizStartedAt !== undefined &&
      normalized.some(
        (event) =>
          event.eventName === "quiz_completed" && event.timestamp >= quizStartedAt,
      ),
    hasResultView: resultViewedAt !== undefined,
    hasOrderedStoreClick:
      resultViewedAt !== undefined &&
      normalized.some(
        (event) =>
          event.eventName === "product_clicked" && event.timestamp > resultViewedAt,
      ),
  };
}

export function normalizeMerchantHostname(destinationUrl?: string | null) {
  if (!destinationUrl?.trim()) {
    return null;
  }

  try {
    return new URL(destinationUrl).hostname.toLowerCase().replace(/^www\./u, "") || null;
  } catch {
    return null;
  }
}

function buildReadinessComponent(
  value: number | null,
  target: number,
  maxPoints: number,
): PartnerReadinessComponent {
  return {
    value,
    target,
    points:
      value === null
        ? null
        : round(Math.min(Math.max(value / target, 0), 1) * maxPoints, 1),
    maxPoints,
  };
}

export function buildPartnerReadiness(
  input: PartnerReadinessInput,
): PartnerReadiness {
  const components = {
    traffic: buildReadinessComponent(
      input.users30d,
      partnerReadinessThresholds.trafficUsers30d,
      partnerWeights.traffic,
    ),
    quizCompletions: buildReadinessComponent(
      input.quizCompletedSessions30d,
      partnerReadinessThresholds.quizCompletedSessions30d,
      partnerWeights.quizCompletions,
    ),
    commerceClicks: buildReadinessComponent(
      input.storeClickSessions30d,
      partnerReadinessThresholds.storeClickSessions30d,
      partnerWeights.commerceClicks,
    ),
    resultToStoreRate: buildReadinessComponent(
      input.resultToStoreRate30d,
      partnerReadinessThresholds.resultToStoreRate30d,
      partnerWeights.resultToStoreRate,
    ),
    history: buildReadinessComponent(
      input.firstPartyHistoryDays,
      partnerReadinessThresholds.firstPartyHistoryDays,
      partnerWeights.history,
    ),
  };
  const gates = [
    ["traffic_users_30d", input.users30d, partnerReadinessThresholds.trafficUsers30d],
    [
      "quiz_completed_sessions_30d",
      input.quizCompletedSessions30d,
      partnerReadinessThresholds.quizCompletedSessions30d,
    ],
    [
      "store_click_sessions_30d",
      input.storeClickSessions30d,
      partnerReadinessThresholds.storeClickSessions30d,
    ],
    [
      "result_to_store_rate_30d",
      input.resultToStoreRate30d,
      partnerReadinessThresholds.resultToStoreRate30d,
    ],
    [
      "analytics_history_days",
      input.firstPartyHistoryDays,
      partnerReadinessThresholds.firstPartyHistoryDays,
    ],
  ] as const;
  const failingMetrics = gates
    .filter(([, value, target]) => value === null || value < target)
    .map(([id]) => id);
  const componentValues = Object.values(components);
  const hasCompleteData = componentValues.every((component) => component.points !== null);
  const strictOutreachReady = hasCompleteData && failingMetrics.length === 0;
  const score = hasCompleteData
    ? round(
        componentValues.reduce((sum, component) => sum + (component.points ?? 0), 0),
        1,
      )
    : null;
  const status: PartnerReadinessStatus =
    score === null
      ? "insufficient_data"
      : strictOutreachReady
        ? "metric_ready"
        : score < 40
          ? "early"
          : score < 70
            ? "building_evidence"
            : "approaching";

  return {
    score,
    status,
    strictOutreachReady,
    components,
    thresholds: partnerReadinessThresholds,
    failingMetrics,
    manualChecks: [
      "catalog_integrity_no_known_p1",
      "exact_size_offer_routing_verified",
      "content_rights_partner_review",
      "commercial_offer_prepared",
    ].map((id) => ({ id, status: "NOT_OBSERVABLE" as const })),
  };
}

export function getHistoryDays(firstEventAt: string | Date | null, asOfDate: string) {
  if (!firstEventAt) {
    return 0;
  }

  const firstDate = getMoscowCalendarDate(new Date(firstEventAt));
  const difference = Math.floor(
    (parseIsoDate(asOfDate).getTime() - parseIsoDate(firstDate).getTime()) /
      86_400_000,
  );

  return Math.max(difference + 1, 0);
}
