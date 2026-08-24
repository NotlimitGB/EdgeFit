import { describe, expect, it } from "vitest";
import type { AnalyticsDigest } from "@/lib/analytics/digest";
import {
  ANALYTICS_DELIVERY_MAX_ATTEMPTS,
  authorizeAnalyticsCron,
  buildAnalyticsDigestEmailEnvelope,
  buildAnalyticsFailureEmailEnvelope,
  classifyAnalyticsProviderResult,
  getAnalyticsDeliveryClaimDecision,
  getAnalyticsDeliveryIdempotencyKey,
  isAnalyticsDeliveryRetentionEligible,
  parseAnalyticsDeliveryConfig,
  validateStoredAnalyticsDigest,
  type AnalyticsDeliveryLedgerRow,
} from "@/lib/analytics/delivery-core";

const evidenceHash = `sha256:${"a".repeat(64)}`;
const contentHash = `sha256:${"b".repeat(64)}`;
const periodKeys = [
  "yesterday",
  "last7Days",
  "previous7Days",
  "last30Days",
  "previous30Days",
] as const;
const sampling = {
  status: "unsampled" as const,
  sampleShare: 1,
  sampleSize: 10,
  sampleSpace: 10,
  dataLag: 0,
};

function makeDigest(overrides: Partial<AnalyticsDigest> = {}): AnalyticsDigest {
  const traffic = Object.fromEntries(periodKeys.map((key) => [key, { users: 10, visits: 20 }]));
  const funnel = Object.fromEntries(
    periodKeys.map((key) => [
      key,
      {
        quizStartSessions: 8,
        quizCompletedSessions: 4,
        resultViewedSessions: 4,
        resultToStoreSessions: 2,
        storeClickSessions: 2,
        quizCompletionRate: 0.5,
        resultToStoreRate: 0.5,
      },
    ]),
  );
  const commerceWindows = Object.fromEntries(
    periodKeys.map((key) => [key, { clickEvents: 3, uniqueClickSessions: 2 }]),
  );
  const trend = {
    users: { current: 10, previous: 8, absolute: 2, percent: 25 },
    visits: { current: 20, previous: 16, absolute: 4, percent: 25 },
    quizCompletedSessions: { current: 4, previous: 3, absolute: 1, percent: 33.3333 },
    resultViewedSessions: { current: 4, previous: 3, absolute: 1, percent: 33.3333 },
    storeClickSessions: { current: 2, previous: 1, absolute: 1, percent: 100 },
  };
  const goal = {
    users: 2,
    visits: 3,
    visitConversionRate: 0.15,
    userConversionRate: 0.2,
  };
  const goals = { quizStarted: goal, resultViewed: goal, productClicked: goal };
  const digest: AnalyticsDigest = {
    version: "edgefit-digest-v1",
    kind: "daily",
    logicalId: "daily:2026-08-09",
    generatedAt: "2026-08-10T06:15:00.000Z",
    asOfDate: "2026-08-09",
    timezone: "Europe/Moscow",
    status: "complete",
    sourceReport: { version: "edgefit-analytics-report-v1", evidenceHash },
    periods: {
      yesterday: { startDate: "2026-08-09", endDate: "2026-08-09" },
      last7Days: { startDate: "2026-08-03", endDate: "2026-08-09" },
      previous7Days: { startDate: "2026-07-27", endDate: "2026-08-02" },
      last30Days: { startDate: "2026-07-11", endDate: "2026-08-09" },
      previous30Days: { startDate: "2026-06-11", endDate: "2026-07-10" },
    },
    sourceStatus: {
      firstParty: { status: "ok" },
      metrika: { status: "ok" },
      acquisition: { status: "ok" },
    },
    traffic: traffic as AnalyticsDigest["traffic"],
    acquisition: {
      last7Days: { goals },
      last30Days: { goals },
      sources30Days: [],
      landingPages30Days: [],
      referralBreakdownStatus: { status: "ok" },
      referralBreakdown: [],
      quizCompletionPolicy: {
        authority: "first_party_ordered_funnel",
        yandexGoalId: 545241567,
        yandexStatus: "withheld_historical_contamination",
        cleanFrom: "2026-08-11",
      },
    },
    funnel: funnel as AnalyticsDigest["funnel"],
    quizAbandonment: {
      availableFrom: null,
      windows: Object.fromEntries(
        periodKeys.map((key) => [key, { versions: [] }]),
      ) as unknown as AnalyticsDigest["quizAbandonment"]["windows"],
    },
    commerce: {
      windows: commerceWindows as AnalyticsDigest["commerce"]["windows"],
      merchants30Days: [],
      placements30Days: [],
      topBoards30Days: [],
      topOffers30Days: [],
    },
    trends: { weekOverWeek: trend, monthOverMonth: trend },
    partnerReadiness: {
      score: 20,
      status: "early",
      strictOutreachReady: false,
      components: {
        traffic: { value: 10, target: 10_000, points: 0, maxPoints: 25 },
        quizCompletions: { value: 4, target: 1_000, points: 0.1, maxPoints: 20 },
        commerceClicks: { value: 2, target: 300, points: 0.2, maxPoints: 25 },
        resultToStoreRate: { value: 0.5, target: 0.1, points: 20, maxPoints: 20 },
        history: { value: 123, target: 60, points: 10, maxPoints: 10 },
      },
      thresholds: {
        trafficUsers30d: 10_000,
        quizCompletedSessions30d: 1_000,
        storeClickSessions30d: 300,
        resultToStoreRate30d: 0.1,
        firstPartyHistoryDays: 60,
      },
      failingMetrics: ["traffic_users_30d"],
      manualChecks: [
        { id: "catalog_integrity", status: "NOT_OBSERVABLE" },
        { id: "exact_size_routing", status: "NOT_OBSERVABLE" },
        { id: "content_rights_review", status: "NOT_OBSERVABLE" },
        { id: "commercial_offer_prepared", status: "NOT_OBSERVABLE" },
      ],
    },
    dataQuality: [{ code: "safe_warning", severity: "info", message: "Aggregate warning." }],
    sampling: {
      traffic: {
        yesterday: sampling,
        last7Days: sampling,
        previous7Days: sampling,
        last30Days: sampling,
        previous30Days: sampling,
        sources30Days: sampling,
      },
      acquisition: {
        last7Days: sampling,
        last30Days: sampling,
        sources30Days: sampling,
        landingPages30Days: sampling,
        referralBreakdown: sampling,
      },
    },
    delivery: { contentHash },
  };
  return { ...digest, ...overrides };
}

function makeRow(
  digest = makeDigest(),
  overrides: Partial<AnalyticsDeliveryLedgerRow> = {},
): AnalyticsDeliveryLedgerRow {
  return {
    logicalId: digest.logicalId,
    kind: digest.kind,
    digest,
    digestStatus: digest.status,
    evidenceHash: digest.sourceReport.evidenceHash,
    contentHash: digest.delivery.contentHash,
    deliveryStatus: "pending",
    attemptCount: 1,
    leaseToken: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
    lastAttemptAt: new Date("2026-08-10T05:00:00Z"),
    lastErrorCategory: null,
    createdAt: new Date("2026-08-10T05:00:00Z"),
    ...overrides,
  };
}

describe("analytics delivery configuration and authentication", () => {
  it("is disabled for every value except normalized true", () => {
    for (const value of [undefined, "", "false", "0", "yes"]) {
      expect(parseAnalyticsDeliveryConfig({ ANALYTICS_DELIVERY_ENABLED: value })).toEqual({
        state: "disabled",
      });
    }
  });

  it("requires all provider fields only when enabled", () => {
    expect(parseAnalyticsDeliveryConfig({ ANALYTICS_DELIVERY_ENABLED: " TRUE " })).toEqual({
      state: "invalid",
      category: "delivery_config_missing",
    });
    expect(
      parseAnalyticsDeliveryConfig({
        ANALYTICS_DELIVERY_ENABLED: "true",
        RESEND_API_KEY: " key ",
        ANALYTICS_DELIVERY_SENDER: " sender@example.test ",
        ANALYTICS_DELIVERY_RECIPIENT: " owner@example.test ",
      }),
    ).toEqual({
      state: "enabled",
      config: {
        apiKey: "key",
        sender: "sender@example.test",
        recipient: "owner@example.test",
      },
    });
  });

  it("enforces an exact bearer secret without returning it", () => {
    expect(authorizeAnalyticsCron(null, undefined)).toMatchObject({ status: 500 });
    expect(authorizeAnalyticsCron(null, "secret")).toMatchObject({ status: 401 });
    expect(authorizeAnalyticsCron("Bearer wrong", "secret")).toMatchObject({ status: 401 });
    expect(authorizeAnalyticsCron("Bearer secret", "secret")).toEqual({ ok: true });
  });
});

describe("analytics delivery envelopes", () => {
  const config = { sender: "sender@example.test", recipient: "owner@example.test" };

  it("builds a deterministic daily envelope and canonical private attachment", () => {
    const digest = makeDigest();
    const envelope = buildAnalyticsDigestEmailEnvelope(digest, config);
    expect(envelope.message.subject).toBe(
      "EdgeFit Daily Analytics — 2026-08-09 [daily:2026-08-09]",
    );
    expect(envelope.message.text).toContain("PRIVATE — EDGEFIT ANALYTICS");
    expect(envelope.message.text).toContain("Status: COMPLETE");
    expect(envelope.message.attachments?.[0].filename).toBe("edgefit-daily-2026-08-09.json");
    const parsed = JSON.parse(
      Buffer.from(envelope.message.attachments![0].content, "base64").toString("utf8"),
    );
    expect(parsed.version).toBe("edgefit-digest-v1");
    expect(parsed).not.toHaveProperty("recipient");
    expect(envelope.idempotencyKey).toBe(`edgefit/${digest.logicalId}/${contentHash}`);
    expect(envelope.idempotencyKey.length).toBeLessThanOrEqual(256);
  });

  it("keeps weekly identity deterministic and marks partial in the body", () => {
    const envelope = buildAnalyticsDigestEmailEnvelope(
      makeDigest({
        kind: "weekly",
        logicalId: "weekly:2026-W32",
        status: "partial",
        sourceStatus: {
          firstParty: { status: "ok" },
          metrika: { status: "unavailable", diagnostic: { category: "network" } },
          acquisition: { status: "ok" },
        },
      }),
      config,
    );
    expect(envelope.message.subject).toBe(
      "EdgeFit Weekly Analytics — 2026-W32 [weekly:2026-W32]",
    );
    expect(envelope.message.text).toContain("Status: PARTIAL");
    expect(envelope.message.attachments?.[0].filename).toBe("edgefit-weekly-2026-W32.json");
  });

  it("escapes dynamic display values in HTML", () => {
    const digest = makeDigest({
      dataQuality: [
        { code: "<script>alert(1)</script>", severity: "warning", message: "Safe aggregate." },
      ],
    });
    const envelope = buildAnalyticsDigestEmailEnvelope(digest, config);
    expect(envelope.message.html).not.toContain("<script>");
    expect(envelope.message.html).toContain("&lt;script&gt;");
  });

  it("builds a sanitized attachment-free failure notification", () => {
    const envelope = buildAnalyticsFailureEmailEnvelope(
      { kind: "daily", safeId: "daily:2026-08-09", category: "db<secret>" },
      config,
    );
    expect(envelope.message.attachments).toBeUndefined();
    expect(envelope.message.html).not.toContain("<secret>");
    expect(envelope.idempotencyKey).not.toContain("owner@example.test");
  });

  it("rejects oversized provider idempotency keys", () => {
    expect(() =>
      getAnalyticsDeliveryIdempotencyKey(makeDigest({ logicalId: `daily:${"x".repeat(300)}` })),
    ).toThrow("delivery_idempotency_key_invalid");
  });
});

describe("analytics delivery state decisions", () => {
  const now = new Date("2026-08-10T06:15:00Z");
  const digest = makeDigest();

  it("claims a new logical identity", () => {
    expect(getAnalyticsDeliveryClaimDecision(null, digest, now)).toEqual({
      action: "create_and_claim",
    });
  });

  it.each(["sent", "partial_sent"] as const)("returns a zero-write noop for %s", (status) => {
    expect(
      getAnalyticsDeliveryClaimDecision(makeRow(digest, { deliveryStatus: status }), digest, now),
    ).toEqual({ action: "noop" });
  });

  it("marks a different hash as a conflict", () => {
    expect(
      getAnalyticsDeliveryClaimDecision(
        makeRow(digest, { contentHash: `sha256:${"c".repeat(64)}` }),
        digest,
        now,
      ),
    ).toMatchObject({ action: "conflict", category: "logical_id_content_conflict" });
  });

  it("does not reclaim an active lease", () => {
    expect(
      getAnalyticsDeliveryClaimDecision(
        makeRow(digest, {
          deliveryStatus: "sending",
          leaseExpiresAt: new Date("2026-08-10T06:16:00Z"),
        }),
        digest,
        now,
      ),
    ).toEqual({ action: "busy" });
  });

  it("reclaims an expired lease", () => {
    expect(
      getAnalyticsDeliveryClaimDecision(
        makeRow(digest, {
          deliveryStatus: "sending",
          leaseExpiresAt: new Date("2026-08-10T06:14:00Z"),
        }),
        digest,
        now,
      ),
    ).toEqual({ action: "claim_stored" });
  });

  it("fails stale sending without requiring a persisted unknown category", () => {
    expect(
      getAnalyticsDeliveryClaimDecision(
        makeRow(digest, {
          deliveryStatus: "sending",
          leaseExpiresAt: new Date("2026-08-09T20:00:00Z"),
          lastAttemptAt: new Date("2026-08-09T07:15:00Z"),
          lastErrorCategory: null,
        }),
        digest,
        now,
      ),
    ).toEqual({
      action: "fail",
      category: "provider_outcome_unknown_expired",
    });
  });

  it("does not make an old pending known provider failure terminal", () => {
    expect(
      getAnalyticsDeliveryClaimDecision(
        makeRow(digest, {
          deliveryStatus: "pending",
          lastAttemptAt: new Date("2026-08-09T00:00:00Z"),
          lastErrorCategory: "provider_rate_limited",
        }),
        digest,
        now,
      ),
    ).toEqual({ action: "claim_stored" });
  });

  it("stops after five attempts", () => {
    expect(
      getAnalyticsDeliveryClaimDecision(
        makeRow(digest, { attemptCount: ANALYTICS_DELIVERY_MAX_ATTEMPTS }),
        digest,
        now,
      ),
    ).toMatchObject({ action: "fail", category: "delivery_attempts_exhausted" });
  });

  it("does not resend an unknown outcome after 23 hours", () => {
    expect(
      getAnalyticsDeliveryClaimDecision(
        makeRow(digest, {
          lastErrorCategory: "provider_outcome_unknown",
          lastAttemptAt: new Date("2026-08-09T07:15:00Z"),
        }),
        digest,
        now,
      ),
    ).toMatchObject({ action: "fail", category: "provider_outcome_unknown_expired" });
  });
});

describe("provider, stored digest and retention safety", () => {
  it("classifies structured provider outcomes", () => {
    expect(classifyAnalyticsProviderResult({ messageId: "mail_1" })).toEqual({
      type: "success",
      messageId: "mail_1",
    });
    expect(
      classifyAnalyticsProviderResult({
        error: { name: "rate_limit_exceeded", statusCode: 429 },
      }),
    ).toMatchObject({ type: "retry", category: "provider_rate_limited" });
    expect(
      classifyAnalyticsProviderResult({
        error: { name: "internal_server_error", statusCode: 503 },
      }),
    ).toMatchObject({ type: "retry", category: "provider_unavailable" });
    expect(
      classifyAnalyticsProviderResult({
        error: { name: "invalid_idempotent_request", statusCode: 409 },
      }),
    ).toMatchObject({ type: "conflict" });
    expect(
      classifyAnalyticsProviderResult({
        error: { name: "concurrent_idempotent_requests", statusCode: 409 },
      }),
    ).toMatchObject({ type: "retry", category: "provider_concurrent_request" });
    expect(
      classifyAnalyticsProviderResult({
        error: { name: "invalid_api_key", statusCode: 401 },
      }),
    ).toMatchObject({ type: "failed", category: "provider_request_rejected" });
    expect(classifyAnalyticsProviderResult({ threw: true })).toMatchObject({
      type: "retry",
      category: "provider_outcome_unknown",
      unknownOutcome: true,
    });
    expect(
      classifyAnalyticsProviderResult({
        error: { name: "application_error", statusCode: null },
      }),
    ).toMatchObject({
      type: "retry",
      category: "provider_outcome_unknown",
      unknownOutcome: true,
    });
  });

  it("validates immutable stored identity and hashes", () => {
    expect(validateStoredAnalyticsDigest(makeRow())).toMatchObject({ ok: true });
    expect(validateStoredAnalyticsDigest(makeRow(makeDigest(), { contentHash: evidenceHash }))).toEqual({
      ok: false,
      category: "stored_digest_hash_mismatch",
    });
    expect(validateStoredAnalyticsDigest(makeRow(makeDigest(), { digest: { rawPayload: "x" } }))).toEqual({
      ok: false,
      category: "stored_digest_invalid",
    });
  });

  it("retains pending/sending rows and expires only terminal rows after 90 days", () => {
    const now = new Date("2026-08-10T00:00:00Z");
    const old = new Date("2026-05-01T00:00:00Z");
    expect(isAnalyticsDeliveryRetentionEligible(makeRow(makeDigest(), { deliveryStatus: "sent", createdAt: old }), now)).toBe(true);
    expect(isAnalyticsDeliveryRetentionEligible(makeRow(makeDigest(), { deliveryStatus: "pending", createdAt: old }), now)).toBe(false);
    expect(isAnalyticsDeliveryRetentionEligible(makeRow(makeDigest(), { deliveryStatus: "sending", createdAt: old }), now)).toBe(false);
    expect(isAnalyticsDeliveryRetentionEligible(makeRow(makeDigest(), { deliveryStatus: "failed", createdAt: now }), now)).toBe(false);
  });
});
