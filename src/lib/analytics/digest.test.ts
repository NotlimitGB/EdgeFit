import { describe, expect, it } from "vitest";
import type { AnalyticsReport } from "@/lib/analytics/reporting-server";
import { getAnalyticsReportPrivacyViolations } from "@/lib/analytics/reporting-core";
import {
  ANALYTICS_DIGEST_VERSION,
  buildDailyAnalyticsDigest,
  buildWeeklyAnalyticsDigest,
  canonicalizeAnalyticsDigest,
  getAnalyticsDigestPrivacyViolations,
  getRelativeMovementEvidence,
  type AnalyticsDigest,
} from "@/lib/analytics/digest";

const windowKeys = [
  "yesterday",
  "last7Days",
  "previous7Days",
  "last30Days",
  "previous30Days",
] as const;

const sampling = {
  status: "unsampled" as const,
  sampleShare: 1,
  sampleSize: 100,
  sampleSpace: 100,
  dataLag: 0,
};

function goalMetrics(seed: number) {
  return {
    quizStarted: {
      users: seed + 1,
      visits: seed + 2,
      visitConversionRate: 0.2,
      userConversionRate: 0.25,
    },
    resultViewed: {
      users: seed + 3,
      visits: seed + 4,
      visitConversionRate: 0.15,
      userConversionRate: 0.18,
    },
    productClicked: {
      users: seed + 5,
      visits: seed + 6,
      visitConversionRate: 0.1,
      userConversionRate: 0.12,
    },
  };
}

function eventMetrics(seed: number) {
  return {
    home_viewed: { eventCount: seed + 1, uniqueSessions: seed + 1 },
    quiz_started: { eventCount: seed + 2, uniqueSessions: seed + 2 },
    quiz_completed: { eventCount: seed + 3, uniqueSessions: seed + 3 },
    result_viewed: { eventCount: seed + 4, uniqueSessions: seed + 4 },
    product_clicked: { eventCount: seed + 5, uniqueSessions: seed + 5 },
    email_submitted: { eventCount: seed + 6, uniqueSessions: seed + 6 },
    recommendation_feedback_submitted: {
      eventCount: seed + 7,
      uniqueSessions: seed + 7,
    },
    recommendation_feedback_reason_selected: {
      eventCount: seed + 8,
      uniqueSessions: seed + 8,
    },
  };
}

function makeReport(): AnalyticsReport {
  const traffic = Object.fromEntries(
    windowKeys.map((key, index) => [
      key,
      {
        users: 20 + index,
        visits: 30 + index,
        bounceRate: 0.2,
        pageDepth: 3,
        avgVisitDurationSeconds: 120,
        sampling: { ...sampling },
      },
    ]),
  );
  const funnel = Object.fromEntries(
    windowKeys.map((key, index) => [
      key,
      {
        quizStartSessions: 10 + index,
        quizCompletedSessions: 7 + index,
        resultViewedSessions: 6 + index,
        resultToStoreSessions: 3 + index,
        storeClickSessions: 4 + index,
        quizCompletionRate: 0.7,
        resultToStoreRate: 0.5,
      },
    ]),
  );
  const commerceWindows = Object.fromEntries(
    windowKeys.map((key, index) => [
      key,
      { clickEvents: 8 + index, uniqueClickSessions: 4 + index },
    ]),
  );
  const events = Object.fromEntries(
    windowKeys.map((key, index) => [key, eventMetrics(index)]),
  );
  const trendGroup = {
    users: { current: 20, previous: 10, absolute: 10, percent: 100 },
    visits: { current: 30, previous: 20, absolute: 10, percent: 50 },
    quizCompletedSessions: { current: 7, previous: 5, absolute: 2, percent: 40 },
    resultViewedSessions: { current: 6, previous: 4, absolute: 2, percent: 50 },
    storeClickSessions: { current: 4, previous: 0, absolute: 4, percent: null },
  };

  return {
    version: "edgefit-analytics-report-v1",
    generatedAt: "2026-08-10T06:15:00.000Z",
    asOfDate: "2026-08-09",
    timezone: "Europe/Moscow",
    windows: {
      yesterday: { startDate: "2026-08-09", endDate: "2026-08-09" },
      last7Days: { startDate: "2026-08-03", endDate: "2026-08-09" },
      previous7Days: { startDate: "2026-07-27", endDate: "2026-08-02" },
      last30Days: { startDate: "2026-07-11", endDate: "2026-08-09" },
      previous30Days: { startDate: "2026-06-11", endDate: "2026-07-10" },
    },
    sourceStatus: {
      firstParty: { status: "ok" },
      metrika: { status: "ok" },
    },
    traffic: {
      ...traffic,
      sources30Days: [
        { source: "organic", label: "Organic", users: 14, visits: 20, share: 0.5 },
        { source: "direct", label: "Direct", users: 9, visits: 12, share: 0.3 },
      ],
      sourcesSampling: { ...sampling },
    },
    acquisition: {
      sourceStatus: { status: "ok" },
      last7Days: { goals: goalMetrics(1), sampling: { ...sampling } },
      last30Days: { goals: goalMetrics(10), sampling: { ...sampling } },
      sources30Days: [
        {
          source: "organic",
          label: "Organic",
          users: 14,
          visits: 20,
          goals: goalMetrics(20),
        },
        {
          source: "referral",
          label: "Referral",
          users: 8,
          visits: 11,
          goals: goalMetrics(30),
        },
      ],
      sourcesSampling: { ...sampling },
      landingPages30Days: [
        { path: "/catalog", users: 10, visits: 13, goals: goalMetrics(40) },
        {
          path: "/boards/yes-basic",
          users: 7,
          visits: 9,
          goals: goalMetrics(50),
        },
      ],
      landingPagesSampling: { ...sampling },
      referralBreakdownStatus: { status: "ok" },
      referralBreakdown: [
        {
          domain: "partner.example",
          classification: "external_referral",
          users: 2,
          visits: 12,
          goals: goalMetrics(60),
        },
      ],
      referralSampling: { ...sampling },
      quizCompletionPolicy: {
        authority: "first_party_ordered_funnel",
        yandexGoalId: 545241567,
        yandexStatus: "withheld_historical_contamination",
        cleanFrom: "2026-08-11",
      },
    },
    firstParty: {
      historyDays: 123,
      events,
    },
    funnel,
    quizAbandonment: {
      availableFrom: null,
      windows: Object.fromEntries(
        windowKeys.map((key) => [key, { versions: [] }]),
      ),
    },
    recommendationFeedback: {
      availableFrom: null,
      windows: Object.fromEntries(
        windowKeys.map((key) => [
          key,
          {
            feedbackSessions: 3,
            wouldConsiderSessions: 1,
            needMoreConfidenceSessions: 1,
            notAFitSessions: 1,
            wouldConsiderRate: 1 / 3,
            feedbackResponseRate: 0.5,
            reasonBreakdown: [
              "size_uncertainty",
              "board_uncertainty",
              "explanation_insufficient",
              "price_or_offer",
              "preference_mismatch",
              "other",
            ].map((reason, index) => ({ reason, sessions: index < 2 ? 1 : 0 })),
          },
        ]),
      ),
    },
    firstPartyAcquisition: {
      availableFrom: "2026-08-20T09:00:00.000Z",
      windows: {
        last7Days: {
          rows: [
            {
              source: "yandex",
              medium: "cpc",
              campaign: "edgefit_023a",
              referrerDomain: null,
              classification: "campaign",
              quizStartSessions: 2,
              quizCompletedSessions: 1,
              resultViewSessions: 2,
              resultToStoreSessions: 1,
              storeClickSessions: 1,
              feedbackSessions: 1,
              wouldConsiderSessions: 1,
              quizCompletionRate: 0.5,
              resultToStoreRate: 0.5,
              feedbackResponseRate: 0.5,
              wouldConsiderRate: 1,
            },
          ],
        },
        last30Days: { rows: [] },
      },
    },
    commerce: {
      windows: commerceWindows,
      clickSources30Days: [
        { value: "board-page", clickEvents: 6, uniqueClickSessions: 3, shareOfClicks: 0.5 },
      ],
      placements30Days: [
        { value: "catalog", clickEvents: 7, uniqueClickSessions: 4, shareOfClicks: 0.58 },
        { value: "board-page", clickEvents: 5, uniqueClickSessions: 3, shareOfClicks: 0.42 },
      ],
      sizes30Days: [
        { value: "159", clickEvents: 4, uniqueClickSessions: 2, shareOfClicks: 0.33 },
      ],
      merchants30Days: [
        {
          merchant: "traektoria.ru",
          value: "traektoria.ru",
          clickEvents: 8,
          uniqueClickSessions: 4,
          shareOfClicks: 0.67,
          topBoards: [{ boardSlug: "yes-basic", clickEvents: 3 }],
          topOffers: [{ offerSlug: "yes-basic-wide", clickEvents: 2 }],
          topSizes: [{ sizeLabel: "159W", clickEvents: 2 }],
        },
      ],
      topBoards30Days: [
        { boardSlug: "yes-basic", clickEvents: 5, uniqueClickSessions: 3 },
        { boardSlug: "yes-standard", clickEvents: 3, uniqueClickSessions: 2 },
      ],
      topOffers30Days: [
        {
          offerSlug: "yes-basic-wide",
          clickEvents: 4,
          uniqueClickSessions: 2,
          source: "catalog-card",
          merchant: "traektoria.ru",
        },
      ],
    },
    trends: {
      weekOverWeek: trendGroup,
      monthOverMonth: structuredClone(trendGroup),
    },
    partnerReadiness: {
      score: 23.5,
      status: "early",
      strictOutreachReady: false,
      components: {
        traffic: { value: 36, target: 10_000, points: 0.1, maxPoints: 25 },
        quizCompletions: { value: 6, target: 1_000, points: 0.1, maxPoints: 20 },
        commerceClicks: { value: 3, target: 300, points: 0.3, maxPoints: 25 },
        resultToStoreRate: { value: 0.33, target: 0.1, points: 20, maxPoints: 20 },
        history: { value: 123, target: 60, points: 10, maxPoints: 10 },
      },
      thresholds: {
        trafficUsers30d: 10_000,
        quizCompletedSessions30d: 1_000,
        storeClickSessions30d: 300,
        resultToStoreRate30d: 0.1,
        firstPartyHistoryDays: 60,
      },
      failingMetrics: ["traffic_users_30d", "quiz_completed_sessions_30d"],
      manualChecks: [
        { id: "catalog_integrity", status: "NOT_OBSERVABLE" },
        { id: "exact_size_routing", status: "NOT_OBSERVABLE" },
        { id: "content_rights_review", status: "NOT_OBSERVABLE" },
        { id: "commercial_offer_prepared", status: "NOT_OBSERVABLE" },
      ],
    },
    dataQuality: [
      {
        code: "legacy_payload_string_encoding",
        severity: "warning",
        message: "Historical payload rows use legacy string encoding.",
      },
      {
        code: "incomplete_exact_offer_provenance",
        severity: "info",
        message: "Historical click rows may not include exact offer provenance.",
      },
    ],
  } as unknown as AnalyticsReport;
}

function cloneReport(report = makeReport()) {
  return structuredClone(report) as AnalyticsReport;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((nested) => deepFreeze(nested));
  }
  return value;
}

function tamper(digest: AnalyticsDigest) {
  return structuredClone(digest) as unknown as Record<string, unknown>;
}

describe("analytics digest projection", () => {
  it("builds the exact daily version, kind, identity and source version", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    expect(digest.version).toBe(ANALYTICS_DIGEST_VERSION);
    expect(digest.kind).toBe("daily");
    expect(digest.logicalId).toBe("daily:2026-08-09");
    expect(digest.sourceReport.version).toBe("edgefit-analytics-report-v1");
    expect(digest.recommendationFeedback.windows.last30Days).toMatchObject({
      feedbackSessions: 3,
      wouldConsiderSessions: 1,
      wouldConsiderRate: 1 / 3,
      feedbackResponseRate: 0.5,
    });
  });

  it("builds a weekly ISO identity from a completed Monday-to-Sunday window", () => {
    expect(buildWeeklyAnalyticsDigest(makeReport()).logicalId).toBe("weekly:2026-W32");
  });

  it("uses the ISO week-year across a calendar-year boundary", () => {
    const report = cloneReport();
    report.asOfDate = "2021-01-03";
    report.windows.last7Days = { startDate: "2020-12-28", endDate: "2021-01-03" };
    report.windows.previous7Days = { startDate: "2020-12-21", endDate: "2020-12-27" };
    expect(buildWeeklyAnalyticsDigest(report).logicalId).toBe("weekly:2020-W53");
  });

  it.each([
    ["midweek as-of", (report: AnalyticsReport) => (report.asOfDate = "2026-08-08")],
    [
      "non-Monday start",
      (report: AnalyticsReport) =>
        (report.windows.last7Days = { startDate: "2026-08-04", endDate: "2026-08-09" }),
    ],
    [
      "non-contiguous previous week",
      (report: AnalyticsReport) =>
        (report.windows.previous7Days = {
          startDate: "2026-07-20",
          endDate: "2026-07-26",
        }),
    ],
  ])("rejects an invalid weekly period: %s", (_label, mutate) => {
    const report = cloneReport();
    mutate(report);
    expect(() => buildWeeklyAnalyticsDigest(report)).toThrowError("weekly_period_invalid");
  });

  it("marks a digest complete only when all required sources are ok", () => {
    expect(buildDailyAnalyticsDigest(makeReport()).status).toBe("complete");
    const report = cloneReport();
    report.acquisition.sourceStatus = {
      status: "unavailable",
      diagnostic: { category: "upstream", httpStatus: 503 },
    };
    const digest = buildDailyAnalyticsDigest(report);
    expect(digest.status).toBe("partial");
    expect(digest.sourceStatus.acquisition).toEqual({
      status: "unavailable",
      diagnostic: { category: "upstream", httpStatus: 503 },
    });
  });

  it("preserves null source metrics and null sampling", () => {
    const report = cloneReport();
    report.traffic.yesterday = null;
    report.acquisition.last7Days = null;
    const digest = buildDailyAnalyticsDigest(report);
    expect(digest.traffic.yesterday).toBeNull();
    expect(digest.acquisition.last7Days).toBeNull();
    expect(digest.sampling.traffic.yesterday).toBeNull();
    expect(digest.sampling.acquisition.last7Days).toBeNull();
  });

  it("projects only users and visits from traffic windows", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    expect(digest.traffic.last30Days).toEqual({ users: 23, visits: 33 });
    expect(digest.traffic.last30Days).not.toHaveProperty("bounceRate");
  });

  it("projects only trusted acquisition goals and safe landing paths", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    expect(Object.keys(digest.acquisition.last30Days!.goals)).toEqual([
      "quizStarted",
      "resultViewed",
      "productClicked",
    ]);
    expect(digest.acquisition.landingPages30Days.map((row) => row.path)).toEqual([
      "/catalog",
      "/boards/yes-basic",
    ]);
    expect(JSON.stringify(digest.acquisition)).not.toContain("quizCompleted");
  });

  it("preserves all ordered funnel windows", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    expect(Object.keys(digest.funnel)).toEqual(windowKeys);
    expect(digest.funnel.last7Days).toMatchObject({
      quizStartSessions: 11,
      quizCompletedSessions: 8,
      resultToStoreSessions: 4,
    });
  });

  it("projects commerce without merchant nested tails", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    expect(digest.commerce.merchants30Days[0]).toEqual({
      merchant: "traektoria.ru",
      clickEvents: 8,
      uniqueClickSessions: 4,
      shareOfClicks: 0.67,
    });
    expect(digest.commerce.merchants30Days[0]).not.toHaveProperty("topBoards");
    expect(digest.commerce.topOffers30Days[0].offerSlug).toBe("yes-basic-wide");
  });

  it("preserves trends, Partner Readiness, warnings and sampling explicitly", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    expect(digest.trends.weekOverWeek.storeClickSessions.percent).toBeNull();
    expect(digest.partnerReadiness.score).toBe(23.5);
    expect(digest.partnerReadiness.manualChecks).toHaveLength(4);
    expect(digest.dataQuality.map((warning) => warning.code)).toEqual([
      "legacy_payload_string_encoding",
      "incomplete_exact_offer_provenance",
    ]);
    expect(digest.sampling.traffic.sources30Days?.status).toBe("unsampled");
    expect(digest.sampling.acquisition.landingPages30Days?.sampleShare).toBe(1);
  });

  it("ignores unknown fields injected into the source report", () => {
    const report = makeReport() as AnalyticsReport & Record<string, unknown>;
    report.secretExperimentData = { destination_url: "sensitive" };
    const digest = buildDailyAnalyticsDigest(report);
    expect(digest).not.toHaveProperty("secretExperimentData");
    expect(JSON.stringify(digest)).not.toContain("destination_url");
  });

  it("does not mutate a deeply frozen report", () => {
    const report = deepFreeze(makeReport());
    expect(() => buildDailyAnalyticsDigest(report)).not.toThrow();
  });

  it("is fully deterministic for the same report", () => {
    const report = makeReport();
    const left = buildDailyAnalyticsDigest(report);
    const right = buildDailyAnalyticsDigest(report);
    expect(right).toEqual(left);
    expect(canonicalizeAnalyticsDigest(right)).toBe(canonicalizeAnalyticsDigest(left));
  });
});

describe("canonical serialization and hashing", () => {
  it("sorts keys recursively while preserving array order", () => {
    const value = { z: 1, a: { y: 2, b: 3 }, rows: [{ z: 4, a: 5 }, 2, 1] };
    expect(canonicalizeAnalyticsDigest(value)).toBe(
      '{"a":{"b":3,"y":2},"rows":[{"a":5,"z":4},2,1],"z":1}',
    );
  });

  it("is stable across object insertion order", () => {
    expect(canonicalizeAnalyticsDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalizeAnalyticsDigest({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it.each([
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
    ["negative Infinity", { value: Number.NEGATIVE_INFINITY }],
    ["undefined", { value: undefined }],
    ["bigint", { value: BigInt(1) }],
    ["function", { value: () => 1 }],
    ["symbol", { value: Symbol("x") }],
    ["non-plain object", { value: new Date("2026-08-09T00:00:00.000Z") }],
  ])("rejects unsupported canonical value: %s", (_label, value) => {
    expect(() => canonicalizeAnalyticsDigest(value)).toThrowError(
      "canonicalization_invalid",
    );
  });

  it("rejects cyclic structures", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeAnalyticsDigest(cyclic)).toThrowError(
      "canonicalization_invalid",
    );
  });

  it("produces exact lowercase SHA-256 hash formats", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    expect(digest.sourceReport.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(digest.delivery.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("excludes generatedAt from evidence and content hashes", () => {
    const leftReport = makeReport();
    const rightReport = cloneReport(leftReport);
    rightReport.generatedAt = "2026-08-10T07:45:00.000Z";
    const left = buildDailyAnalyticsDigest(leftReport);
    const right = buildDailyAnalyticsDigest(rightReport);
    expect(right.generatedAt).not.toBe(left.generatedAt);
    expect(right.sourceReport.evidenceHash).toBe(left.sourceReport.evidenceHash);
    expect(right.delivery.contentHash).toBe(left.delivery.contentHash);
  });

  it("changes both hashes when projected evidence changes", () => {
    const leftReport = makeReport();
    const rightReport = cloneReport(leftReport);
    rightReport.traffic.last30Days!.users += 1;
    const left = buildDailyAnalyticsDigest(leftReport);
    const right = buildDailyAnalyticsDigest(rightReport);
    expect(right.sourceReport.evidenceHash).not.toBe(left.sourceReport.evidenceHash);
    expect(right.delivery.contentHash).not.toBe(left.delivery.contentHash);
  });

  it("includes generatedAt and the finished content hash in attachment serialization", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    const serialized = canonicalizeAnalyticsDigest(digest);
    expect(serialized).toContain(digest.generatedAt);
    expect(serialized).toContain(digest.delivery.contentHash);
  });
});

describe("digest privacy and schema validation", () => {
  it("accepts a valid digest in both validators", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    expect(getAnalyticsDigestPrivacyViolations(digest)).toEqual([]);
    expect(getAnalyticsReportPrivacyViolations(digest)).toEqual([]);
  });

  it("rejects an unknown digest key", () => {
    const value = tamper(buildDailyAnalyticsDigest(makeReport()));
    value.futureEvidence = 1;
    expect(getAnalyticsDigestPrivacyViolations(value)).toContain(
      "schema:$.futureEvidence:unknown_key",
    );
  });

  it.each(["sessionId", "session_id", "oauthToken", "DATABASE_URL", "resendApiKey"])(
    "rejects forbidden key %s without including its value",
    (key) => {
      const value = tamper(buildDailyAnalyticsDigest(makeReport()));
      value[key] = "do-not-report-this";
      const violations = getAnalyticsDigestPrivacyViolations(value);
      expect(violations.some((item) => item.startsWith(`privacy:$.${key}:`))).toBe(true);
      expect(violations.join(" ")).not.toContain("do-not-report-this");
    },
  );

  it("does not confuse aggregate users with a user identifier", () => {
    const digest = buildDailyAnalyticsDigest(makeReport());
    expect(
      getAnalyticsDigestPrivacyViolations(digest).filter((item) => item.includes("users")),
    ).toEqual([]);
  });

  it("rejects a full URL value", () => {
    const value = tamper(buildDailyAnalyticsDigest(makeReport()));
    const dataQuality = value.dataQuality as Array<Record<string, unknown>>;
    dataQuality[0].message = "https://edge-fit.vercel.app/private";
    expect(getAnalyticsDigestPrivacyViolations(value)).toContain(
      "privacy:$.dataQuality[0].message:full_url",
    );
  });

  it.each([
    ["query", "/catalog?q=x"],
    ["fragment", "/result#fit"],
    ["protocol-relative", "//example.com/catalog"],
    ["absolute", "https://example.com/catalog"],
  ])("rejects unsafe landing path: %s", (_label, path) => {
    const value = tamper(buildDailyAnalyticsDigest(makeReport()));
    const acquisition = value.acquisition as Record<string, unknown>;
    const landings = acquisition.landingPages30Days as Array<Record<string, unknown>>;
    landings[0].path = path;
    expect(
      getAnalyticsDigestPrivacyViolations(value).some(
        (item) =>
          item === "schema:$.acquisition.landingPages30Days[0].path:invalid_string" ||
          item === "privacy:$.acquisition.landingPages30Days[0].path:full_url",
      ),
    ).toBe(true);
  });

  it("rejects non-finite values in an otherwise shaped digest", () => {
    const value = tamper(buildDailyAnalyticsDigest(makeReport()));
    const traffic = value.traffic as Record<string, Record<string, unknown>>;
    traffic.last30Days.users = Number.NaN;
    expect(getAnalyticsDigestPrivacyViolations(value)).toContain(
      "schema:$.traffic.last30Days.users:invalid_number",
    );
  });

  it("rejects a cyclic tampered digest without recursing indefinitely", () => {
    const value = tamper(buildDailyAnalyticsDigest(makeReport()));
    value.delivery = value;
    expect(getAnalyticsDigestPrivacyViolations(value)).toContain(
      "schema:$.delivery:cyclic_value",
    );
  });
});

describe("relative movement evidence", () => {
  it("returns upward evidence at the threshold", () => {
    expect(
      getRelativeMovementEvidence({
        current: 130,
        previous: 100,
        relativeThreshold: 0.3,
        minimumBaseline: 10,
      }),
    ).toEqual({
      current: 130,
      previous: 100,
      absolute: 30,
      relative: 0.3,
      direction: "up",
    });
  });

  it("returns downward evidence", () => {
    expect(
      getRelativeMovementEvidence({
        current: 70,
        previous: 100,
        relativeThreshold: 0.25,
        minimumBaseline: 10,
      }),
    ).toMatchObject({ absolute: -30, relative: -0.3, direction: "down" });
  });

  it("returns null below the relative threshold", () => {
    expect(
      getRelativeMovementEvidence({
        current: 120,
        previous: 100,
        relativeThreshold: 0.3,
        minimumBaseline: 10,
      }),
    ).toBeNull();
  });

  it("returns null below the minimum baseline", () => {
    expect(
      getRelativeMovementEvidence({
        current: 8,
        previous: 4,
        relativeThreshold: 0.3,
        minimumBaseline: 10,
      }),
    ).toBeNull();
  });

  it("returns null for a zero previous baseline", () => {
    expect(
      getRelativeMovementEvidence({
        current: 10,
        previous: 0,
        relativeThreshold: 0.3,
        minimumBaseline: 0,
      }),
    ).toBeNull();
  });

  it("returns null for invalid numeric inputs and contains no business policy", () => {
    expect(
      getRelativeMovementEvidence({
        current: Number.NaN,
        previous: 10,
        relativeThreshold: 0.3,
        minimumBaseline: 1,
      }),
    ).toBeNull();
  });
});
