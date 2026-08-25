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
  "recommendation_feedback_submitted",
  "recommendation_feedback_reason_selected",
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

export const acquisitionGoalKeys = [
  "quizStarted",
  "resultViewed",
  "productClicked",
] as const;

export type AcquisitionGoalKey = (typeof acquisitionGoalKeys)[number];

export interface GoalConversionMetric {
  users: number;
  visits: number;
  visitConversionRate: number;
  userConversionRate: number;
}

export interface AcquisitionGoalWindow {
  goals: Record<AcquisitionGoalKey, GoalConversionMetric>;
  sampling: SamplingMetadata;
}

export interface AcquisitionSourceMetric {
  source: string;
  label: string;
  visits: number;
  users: number;
  goals: Record<AcquisitionGoalKey, GoalConversionMetric>;
}

export interface AcquisitionLandingMetric {
  path: string;
  visits: number;
  users: number;
  goals: Record<AcquisitionGoalKey, GoalConversionMetric>;
}

export type ReferralClassification =
  | "external_referral"
  | "self_referral"
  | "unknown_referral";

export interface ReferralBreakdownMetric {
  domain: string | null;
  classification: ReferralClassification;
  visits: number;
  users: number;
  goals: Record<AcquisitionGoalKey, GoalConversionMetric>;
}

export interface QuizProgressionEvent {
  windowKey: ReportWindowKey;
  sessionId: string;
  eventName: "quiz_started" | "quiz_step_completed" | "quiz_completed";
  createdAt: string;
  quizVersion: string | null;
  stepIndex: number | null;
  stepKey: string | null;
  totalSteps: number | null;
}

export interface QuizStepAbandonmentMetric {
  stepIndex: number;
  stepKey: string;
  totalSteps: number;
  completedStepSessions: number;
  abandonedAfterStepSessions: number;
  stepToNextConversionRate: number | null;
}

export interface QuizVersionAbandonmentMetric {
  quizVersion: string;
  quizStartSessions: number;
  quizCompletedSessions: number;
  steps: QuizStepAbandonmentMetric[];
}

export interface QuizAbandonmentReport {
  availableFrom: string | null;
  windows: Record<
    ReportWindowKey,
    { versions: QuizVersionAbandonmentMetric[] }
  >;
}

export const recommendationFeedbackOutcomeKeys = [
  "would_consider",
  "need_more_confidence",
  "not_a_fit",
] as const;

export type RecommendationFeedbackOutcomeKey =
  (typeof recommendationFeedbackOutcomeKeys)[number];

export const recommendationFeedbackReasonKeys = [
  "size_uncertainty",
  "board_uncertainty",
  "explanation_insufficient",
  "price_or_offer",
  "preference_mismatch",
  "other",
] as const;

export type RecommendationFeedbackReasonKey =
  (typeof recommendationFeedbackReasonKeys)[number];

export interface RecommendationFeedbackEvent {
  eventId: string;
  windowKey: ReportWindowKey | null;
  sessionId: string;
  eventName:
    | "recommendation_feedback_submitted"
    | "recommendation_feedback_reason_selected";
  createdAt: string;
  feedbackOutcome: string | null;
  feedbackReason: string | null;
  productId: string | null;
  productSlug: string | null;
  brand: string | null;
  modelName: string | null;
  recommendedSizeLabel: string | null;
  recommendedSizeCm: number | null;
  recommendedWidthType: string | null;
  recommendationRank: number | null;
  recommendationScore: number | null;
  algorithmVersion: string | null;
  resultVariant: string | null;
}

export interface RecommendationFeedbackWindow {
  feedbackSessions: number;
  wouldConsiderSessions: number;
  needMoreConfidenceSessions: number;
  notAFitSessions: number;
  wouldConsiderRate: number | null;
  feedbackResponseRate: number | null;
  reasonBreakdown: Array<{
    reason: RecommendationFeedbackReasonKey;
    sessions: number;
  }>;
}

export interface RecommendationFeedbackReport {
  availableFrom: string | null;
  windows: Record<ReportWindowKey, RecommendationFeedbackWindow>;
}

export const quizCompletionAcquisitionPolicy = {
  authority: "first_party_ordered_funnel",
  yandexGoalId: 545241567,
  yandexStatus: "withheld_historical_contamination",
  cleanFrom: "2026-08-11",
} as const;

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

export function buildQuizAbandonmentReport(
  events: readonly QuizProgressionEvent[],
): QuizAbandonmentReport {
  const windows = reportWindowKeys.reduce<QuizAbandonmentReport["windows"]>(
    (result, windowKey) => {
      result[windowKey] = { versions: [] };
      return result;
    },
    {} as QuizAbandonmentReport["windows"],
  );
  let availableFrom: string | null = null;

  for (const windowKey of reportWindowKeys) {
    const windowEvents = events.filter((event) => event.windowKey === windowKey);
    const versions = [...new Set(windowEvents.flatMap((event) =>
      event.quizVersion?.trim() ? [event.quizVersion.trim()] : [],
    ))].sort();

    for (const quizVersion of versions) {
      const versionEvents = windowEvents.filter(
        (event) => event.quizVersion?.trim() === quizVersion,
      );
      const stepEvents = versionEvents.filter(
        (event) =>
          event.eventName === "quiz_step_completed" &&
          Number.isInteger(event.stepIndex) &&
          (event.stepIndex ?? 0) >= 1 &&
          Number.isInteger(event.totalSteps) &&
          (event.totalSteps ?? 0) >= (event.stepIndex ?? 0) &&
          Boolean(event.stepKey?.trim()),
      );
      if (stepEvents.length === 0) {
        continue;
      }

      const totalStepValues = new Set(stepEvents.map((event) => event.totalSteps));
      if (totalStepValues.size !== 1) {
        continue;
      }
      const totalSteps = stepEvents[0]?.totalSteps ?? 0;
      const descriptors = new Map<number, string>();
      let descriptorConflict = false;
      for (const event of stepEvents) {
        const stepIndex = event.stepIndex ?? 0;
        const stepKey = event.stepKey?.trim() ?? "";
        const previous = descriptors.get(stepIndex);
        if (previous && previous !== stepKey) {
          descriptorConflict = true;
          break;
        }
        descriptors.set(stepIndex, stepKey);
        if (!availableFrom || event.createdAt < availableFrom) {
          availableFrom = event.createdAt;
        }
      }
      if (descriptorConflict) {
        continue;
      }

      const completedQuizSessions = new Set(
        versionEvents
          .filter((event) => event.eventName === "quiz_completed")
          .map((event) => event.sessionId),
      );
      const maxStepBySession = new Map<string, number>();
      const sessionsByStep = new Map<number, Set<string>>();
      for (const event of stepEvents) {
        const stepIndex = event.stepIndex ?? 0;
        const sessions = sessionsByStep.get(stepIndex) ?? new Set<string>();
        sessions.add(event.sessionId);
        sessionsByStep.set(stepIndex, sessions);
        maxStepBySession.set(
          event.sessionId,
          Math.max(maxStepBySession.get(event.sessionId) ?? 0, stepIndex),
        );
      }

      const steps = [...descriptors.entries()]
        .sort(([left], [right]) => left - right)
        .map(([stepIndex, stepKey]) => {
          const completedSessions = sessionsByStep.get(stepIndex) ?? new Set<string>();
          const nextSessions =
            stepIndex === totalSteps
              ? completedQuizSessions
              : (sessionsByStep.get(stepIndex + 1) ?? new Set<string>());
          const abandonedAfterStepSessions = [...completedSessions].filter(
            (sessionId) =>
              maxStepBySession.get(sessionId) === stepIndex &&
              !completedQuizSessions.has(sessionId),
          ).length;
          return {
            stepIndex,
            stepKey,
            totalSteps,
            completedStepSessions: completedSessions.size,
            abandonedAfterStepSessions,
            stepToNextConversionRate: calculateRate(
              nextSessions.size,
              completedSessions.size,
            ),
          };
        });

      windows[windowKey].versions.push({
        quizVersion,
        quizStartSessions: new Set(
          versionEvents
            .filter((event) => event.eventName === "quiz_started")
            .map((event) => event.sessionId),
        ).size,
        quizCompletedSessions: completedQuizSessions.size,
        steps,
      });
    }
  }

  return { availableFrom, windows };
}

function isNonEmpty(value: string | null) {
  return Boolean(value?.trim());
}

function isValidPrimaryFeedback(event: RecommendationFeedbackEvent) {
  return (
    event.eventName === "recommendation_feedback_submitted" &&
    recommendationFeedbackOutcomeKeys.includes(
      event.feedbackOutcome as RecommendationFeedbackOutcomeKey,
    ) &&
    event.resultVariant === "session" &&
    event.recommendationRank === 1 &&
    isNonEmpty(event.productId) &&
    isNonEmpty(event.productSlug) &&
    isNonEmpty(event.brand) &&
    isNonEmpty(event.modelName) &&
    isNonEmpty(event.recommendedSizeLabel) &&
    Number.isFinite(event.recommendedSizeCm) &&
    ["regular", "mid-wide", "wide"].includes(
      event.recommendedWidthType ?? "",
    ) &&
    Number.isFinite(event.recommendationScore) &&
    isNonEmpty(event.algorithmVersion)
  );
}

function sameFeedbackContext(
  primary: RecommendationFeedbackEvent,
  reason: RecommendationFeedbackEvent,
) {
  return (
    primary.feedbackOutcome === reason.feedbackOutcome &&
    primary.productId === reason.productId &&
    primary.productSlug === reason.productSlug &&
    primary.recommendedSizeLabel === reason.recommendedSizeLabel &&
    primary.recommendationRank === reason.recommendationRank &&
    primary.algorithmVersion === reason.algorithmVersion &&
    primary.resultVariant === reason.resultVariant
  );
}

export function buildRecommendationFeedbackReport(
  events: readonly RecommendationFeedbackEvent[],
  resultViewedSessions: Readonly<Record<ReportWindowKey, number>>,
): RecommendationFeedbackReport {
  const windows = Object.fromEntries(
    reportWindowKeys.map((windowKey) => [
      windowKey,
      {
        feedbackSessions: 0,
        wouldConsiderSessions: 0,
        needMoreConfidenceSessions: 0,
        notAFitSessions: 0,
        wouldConsiderRate: null,
        feedbackResponseRate: null,
        reasonBreakdown: recommendationFeedbackReasonKeys.map((reason) => ({
          reason,
          sessions: 0,
        })),
      } satisfies RecommendationFeedbackWindow,
    ]),
  ) as Record<ReportWindowKey, RecommendationFeedbackWindow>;
  const sortedEvents = [...events].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.eventId.localeCompare(right.eventId),
  );
  const validPrimaryEvents = sortedEvents.filter(isValidPrimaryFeedback);
  const availableFrom = validPrimaryEvents[0]?.createdAt ?? null;

  for (const windowKey of reportWindowKeys) {
    const primaryBySession = new Map<string, RecommendationFeedbackEvent>();
    for (const event of validPrimaryEvents) {
      if (event.windowKey === windowKey && !primaryBySession.has(event.sessionId)) {
        primaryBySession.set(event.sessionId, event);
      }
    }

    const reasonBySession = new Map<string, RecommendationFeedbackReasonKey>();
    for (const event of sortedEvents) {
      if (
        event.windowKey !== windowKey ||
        event.eventName !== "recommendation_feedback_reason_selected" ||
        reasonBySession.has(event.sessionId) ||
        !recommendationFeedbackReasonKeys.includes(
          event.feedbackReason as RecommendationFeedbackReasonKey,
        )
      ) {
        continue;
      }

      const primary = primaryBySession.get(event.sessionId);
      if (
        primary &&
        (event.createdAt > primary.createdAt ||
          (event.createdAt === primary.createdAt &&
            event.eventId > primary.eventId)) &&
        sameFeedbackContext(primary, event)
      ) {
        reasonBySession.set(
          event.sessionId,
          event.feedbackReason as RecommendationFeedbackReasonKey,
        );
      }
    }

    const primaryEvents = [...primaryBySession.values()];
    const feedbackSessions = primaryEvents.length;
    const wouldConsiderSessions = primaryEvents.filter(
      (event) => event.feedbackOutcome === "would_consider",
    ).length;
    const needMoreConfidenceSessions = primaryEvents.filter(
      (event) => event.feedbackOutcome === "need_more_confidence",
    ).length;
    const notAFitSessions = primaryEvents.filter(
      (event) => event.feedbackOutcome === "not_a_fit",
    ).length;

    windows[windowKey] = {
      feedbackSessions,
      wouldConsiderSessions,
      needMoreConfidenceSessions,
      notAFitSessions,
      wouldConsiderRate: calculateRate(
        wouldConsiderSessions,
        feedbackSessions,
      ),
      feedbackResponseRate: calculateRate(
        feedbackSessions,
        resultViewedSessions[windowKey],
      ),
      reasonBreakdown: recommendationFeedbackReasonKeys.map((reason) => ({
        reason,
        sessions: [...reasonBySession.values()].filter(
          (selectedReason) => selectedReason === reason,
        ).length,
      })),
    };
  }

  return { availableFrom, windows };
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
