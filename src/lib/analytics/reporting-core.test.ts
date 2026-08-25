import { describe, expect, it } from "vitest";
import {
  buildQuizAbandonmentReport,
  buildRecommendationFeedbackReport,
  addCalendarDays,
  buildFunnelMetrics,
  buildPartnerReadiness,
  buildReportWindows,
  calculateRate,
  calculateTrend,
  evaluateSessionTimeline,
  getAnalyticsReportPrivacyViolations,
  getHistoryDays,
  getMoscowCalendarDate,
  normalizeMerchantHostname,
  type RecommendationFeedbackEvent,
} from "@/lib/analytics/reporting-core";

describe("analytics reporting core", () => {
  it("builds session-deduplicated recommendation feedback metrics", () => {
    let sequence = 0;
    const primary = (
      sessionId: string,
      feedbackOutcome: "would_consider" | "need_more_confidence" | "not_a_fit",
    ) => ({
      eventId: `event-${String(++sequence).padStart(2, "0")}`,
      windowKey: "last7Days" as const,
      sessionId,
      eventName: "recommendation_feedback_submitted" as const,
      createdAt: `2026-08-24T10:00:${String(sequence).padStart(2, "0")}.000Z`,
      feedbackOutcome,
      feedbackReason: null,
      productId: "product-1",
      productSlug: "test-board",
      brand: "Test",
      modelName: "Board",
      recommendedSizeLabel: "156",
      recommendedSizeCm: 156,
      recommendedWidthType: "regular",
      recommendationRank: 1,
      recommendationScore: 90,
      algorithmVersion: "v1.6.4",
      resultVariant: "session",
    });
    const events: RecommendationFeedbackEvent[] = [
      primary("A", "would_consider"),
      primary("A", "not_a_fit"),
      primary("B", "need_more_confidence"),
      primary("C", "not_a_fit"),
    ];
    events.push({
      ...events[2],
      eventId: "reason-1",
      eventName: "recommendation_feedback_reason_selected",
      createdAt: "2026-08-24T10:01:00.000Z",
      feedbackReason: "size_uncertainty",
    });
    events.push({
      ...events[3],
      eventId: "reason-2",
      eventName: "recommendation_feedback_reason_selected",
      createdAt: "2026-08-24T10:01:01.000Z",
      feedbackReason: "price_or_offer",
    });

    const result = buildRecommendationFeedbackReport(events, {
      yesterday: 0,
      last7Days: 4,
      previous7Days: 0,
      last30Days: 0,
      previous30Days: 0,
    });

    expect(result.availableFrom).toBe("2026-08-24T10:00:01.000Z");
    expect(result.windows.last7Days).toMatchObject({
      feedbackSessions: 3,
      wouldConsiderSessions: 1,
      needMoreConfidenceSessions: 1,
      notAFitSessions: 1,
      wouldConsiderRate: 0.3333,
      feedbackResponseRate: 3 / 4,
    });
    expect(result.windows.last7Days.reasonBreakdown).toEqual(
      expect.arrayContaining([
        { reason: "size_uncertainty", sessions: 1 },
        { reason: "price_or_offer", sessions: 1 },
      ]),
    );
  });

  it("builds session-level quiz abandonment without double-counting retries", () => {
    const at = "2026-08-24T10:00:00.000Z";
    const event = (
      sessionId: string,
      eventName: "quiz_started" | "quiz_step_completed" | "quiz_completed",
      stepIndex: number | null = null,
    ) => ({
      windowKey: "last7Days" as const,
      sessionId,
      eventName,
      createdAt: at,
      quizVersion: "v1",
      stepIndex,
      stepKey: stepIndex ? ["body", "profile", "style"][stepIndex - 1] ?? null : null,
      totalSteps: stepIndex ? 3 : null,
    });
    const report = buildQuizAbandonmentReport([
      event("A", "quiz_started"),
      event("A", "quiz_step_completed", 1),
      event("A", "quiz_step_completed", 2),
      event("A", "quiz_step_completed", 3),
      event("A", "quiz_completed"),
      event("B", "quiz_started"),
      event("B", "quiz_step_completed", 1),
      event("B", "quiz_step_completed", 2),
      event("B", "quiz_step_completed", 2),
      event("C", "quiz_started"),
      event("C", "quiz_step_completed", 1),
    ]);

    expect(report.availableFrom).toBe(at);
    expect(report.windows.last7Days.versions).toEqual([
      {
        quizVersion: "v1",
        quizStartSessions: 3,
        quizCompletedSessions: 1,
        steps: [
          expect.objectContaining({
            stepIndex: 1,
            completedStepSessions: 3,
            abandonedAfterStepSessions: 1,
            stepToNextConversionRate: 0.6667,
          }),
          expect.objectContaining({
            stepIndex: 2,
            completedStepSessions: 2,
            abandonedAfterStepSessions: 1,
            stepToNextConversionRate: 0.5,
          }),
          expect.objectContaining({
            stepIndex: 3,
            completedStepSessions: 1,
            abandonedAfterStepSessions: 0,
            stepToNextConversionRate: 1,
          }),
        ],
      },
    ]);
    expect(report.windows.previous7Days.versions).toEqual([]);
  });

  it("uses yesterday in Europe/Moscow as the report date", () => {
    const result = buildReportWindows(new Date("2026-08-09T21:30:00.000Z"));
    expect(result.asOfDate).toBe("2026-08-09");
  });

  it("does not use the server UTC date at the Moscow boundary", () => {
    expect(getMoscowCalendarDate(new Date("2026-08-09T21:30:00.000Z"))).toBe(
      "2026-08-10",
    );
  });

  it("builds exact non-overlapping completed-day windows", () => {
    const result = buildReportWindows(new Date("2026-08-09T12:00:00.000Z"));
    expect(result).toEqual({
      asOfDate: "2026-08-08",
      windows: {
        yesterday: { startDate: "2026-08-08", endDate: "2026-08-08" },
        last7Days: { startDate: "2026-08-02", endDate: "2026-08-08" },
        previous7Days: { startDate: "2026-07-26", endDate: "2026-08-01" },
        last30Days: { startDate: "2026-07-10", endDate: "2026-08-08" },
        previous30Days: { startDate: "2026-06-10", endDate: "2026-07-09" },
      },
    });
  });

  it("adds calendar days across month and year boundaries", () => {
    expect(addCalendarDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("returns null for a zero rate denominator", () => {
    expect(calculateRate(0, 0)).toBeNull();
  });

  it("caps impossible ratios at one", () => {
    expect(calculateRate(4, 2)).toBe(1);
  });

  it("builds funnel rates from unique qualifying sessions", () => {
    expect(
      buildFunnelMetrics({
        quizStartSessions: 4,
        quizCompletedSessions: 3,
        resultViewedSessions: 2,
        resultToStoreSessions: 1,
        storeClickSessions: 5,
      }),
    ).toMatchObject({ quizCompletionRate: 0.75, resultToStoreRate: 0.5 });
  });

  it("requires quiz completion after quiz start", () => {
    expect(
      evaluateSessionTimeline([
        { eventName: "quiz_completed", createdAt: "2026-08-01T10:00:00Z" },
        { eventName: "quiz_started", createdAt: "2026-08-01T10:01:00Z" },
      ]).hasOrderedQuizCompletion,
    ).toBe(false);
  });

  it("qualifies an ordered quiz completion once per session", () => {
    expect(
      evaluateSessionTimeline([
        { eventName: "quiz_started", createdAt: "2026-08-01T10:00:00Z" },
        { eventName: "quiz_completed", createdAt: "2026-08-01T10:01:00Z" },
        { eventName: "quiz_completed", createdAt: "2026-08-01T10:02:00Z" },
      ]).hasOrderedQuizCompletion,
    ).toBe(true);
  });

  it("requires a store click strictly after a result view", () => {
    expect(
      evaluateSessionTimeline([
        { eventName: "product_clicked", createdAt: "2026-08-01T10:00:00Z" },
        { eventName: "result_viewed", createdAt: "2026-08-01T10:01:00Z" },
      ]).hasOrderedStoreClick,
    ).toBe(false);
  });

  it("qualifies result to store behavior without placement assumptions", () => {
    expect(
      evaluateSessionTimeline([
        { eventName: "result_viewed", createdAt: "2026-08-01T10:00:00Z" },
        { eventName: "product_clicked", createdAt: "2026-08-01T10:01:00Z" },
      ]).hasOrderedStoreClick,
    ).toBe(true);
  });

  it("returns null percent when the previous trend value is zero", () => {
    expect(calculateTrend(5, 0)).toEqual({
      current: 5,
      previous: 0,
      absolute: 5,
      percent: null,
    });
  });

  it("calculates a decimal trend", () => {
    expect(calculateTrend(120, 100).percent).toBe(0.2);
  });

  it("normalizes a merchant hostname without exposing its URL", () => {
    expect(normalizeMerchantHostname("https://www.traektoria.ru/product/1")).toBe(
      "traektoria.ru",
    );
  });

  it("rejects malformed merchant URLs", () => {
    expect(normalizeMerchantHostname("not a URL")).toBeNull();
  });

  it("scores full readiness at 100", () => {
    const result = buildPartnerReadiness({
      users30d: 10_000,
      quizCompletedSessions30d: 1_000,
      storeClickSessions30d: 300,
      resultToStoreRate30d: 0.1,
      firstPartyHistoryDays: 60,
    });
    expect(result).toMatchObject({
      score: 100,
      status: "metric_ready",
      strictOutreachReady: true,
      failingMetrics: [],
    });
  });

  it("calculates transparent partial readiness points", () => {
    const result = buildPartnerReadiness({
      users30d: 5_000,
      quizCompletedSessions30d: 500,
      storeClickSessions30d: 150,
      resultToStoreRate30d: 0.05,
      firstPartyHistoryDays: 30,
    });
    expect(result.score).toBe(50);
    expect(result.status).toBe("building_evidence");
  });

  it("returns insufficient data when Metrika traffic is missing", () => {
    const result = buildPartnerReadiness({
      users30d: null,
      quizCompletedSessions30d: 1_000,
      storeClickSessions30d: 300,
      resultToStoreRate30d: 0.1,
      firstPartyHistoryDays: 60,
    });
    expect(result.score).toBeNull();
    expect(result.status).toBe("insufficient_data");
    expect(result.strictOutreachReady).toBe(false);
  });

  it("fails the strict gate when any one metric misses its target", () => {
    const result = buildPartnerReadiness({
      users30d: 10_000,
      quizCompletedSessions30d: 999,
      storeClickSessions30d: 300,
      resultToStoreRate30d: 0.1,
      firstPartyHistoryDays: 60,
    });
    expect(result.strictOutreachReady).toBe(false);
    expect(result.failingMetrics).toEqual(["quiz_completed_sessions_30d"]);
  });

  it("keeps strong partial evidence in approaching status", () => {
    const result = buildPartnerReadiness({
      users30d: 10_000,
      quizCompletedSessions30d: 1_000,
      storeClickSessions30d: 300,
      resultToStoreRate30d: 0.09,
      firstPartyHistoryDays: 60,
    });
    expect(result.score).toBe(98);
    expect(result.status).toBe("approaching");
  });

  it("marks all non-metric business gates as not observable", () => {
    const result = buildPartnerReadiness({
      users30d: 1,
      quizCompletedSessions30d: 1,
      storeClickSessions30d: 1,
      resultToStoreRate30d: 0.01,
      firstPartyHistoryDays: 1,
    });
    expect(result.manualChecks).toHaveLength(4);
    expect(result.manualChecks.every((check) => check.status === "NOT_OBSERVABLE")).toBe(
      true,
    );
  });

  it("calculates inclusive completed history days in Moscow", () => {
    expect(getHistoryDays("2026-08-01T21:30:00.000Z", "2026-08-08")).toBe(7);
  });

  it("accepts an aggregate privacy-safe report projection", () => {
    expect(
      getAnalyticsReportPrivacyViolations({
        merchant: "traektoria.ru",
        boardSlug: "yes-basic",
        metrics: { sessions: 3, rate: 0.25 },
      }),
    ).toEqual([]);
  });

  it("detects private fields and raw URLs in nested report data", () => {
    expect(
      getAnalyticsReportPrivacyViolations({
        rows: [{ session_id: "private", destination: "https://shop.example/item" }],
        email: "private@example.com",
      }),
    ).toEqual(["email", "rows[0].destination:url", "rows[0].session_id"]);
  });
});
