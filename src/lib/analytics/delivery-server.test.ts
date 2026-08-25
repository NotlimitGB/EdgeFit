import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AnalyticsDigest } from "@/lib/analytics/digest";
import type {
  AnalyticsDeliveryDependencies,
  AnalyticsDeliveryRepository,
  AnalyticsMailer,
} from "@/lib/analytics/delivery-server";
import { getAnalyticsDeliveryClaimDecision } from "@/lib/analytics/delivery-core";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/client", () => ({ получитьКлиентБазы: vi.fn() }));
vi.mock("@/lib/analytics/digest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/digest")>();
  return {
    ...actual,
    buildDailyAnalyticsDigest: vi.fn((report) => report as unknown as AnalyticsDigest),
    buildWeeklyAnalyticsDigest: vi.fn((report) => report as unknown as AnalyticsDigest),
    getAnalyticsDigestPrivacyViolations: vi.fn(() => []),
  };
});

import {
  handleAnalyticsCronRequest,
  runAnalyticsDeliveryRetrySweep,
  runDailyAnalyticsDelivery,
  runWeeklyAnalyticsDelivery,
} from "@/lib/analytics/delivery-server";

const evidenceHash = `sha256:${"a".repeat(64)}`;
const contentHash = `sha256:${"b".repeat(64)}`;

function makeServerDigest(overrides: Partial<AnalyticsDigest> = {}): AnalyticsDigest {
  return {
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
    traffic: { last30Days: { users: 10, visits: 20 } } as AnalyticsDigest["traffic"],
    acquisition: {
      last7Days: null,
      last30Days: null,
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
    funnel: {
      last30Days: {
        quizStartSessions: 8,
        quizCompletedSessions: 4,
        resultViewedSessions: 3,
        resultToStoreSessions: 2,
        storeClickSessions: 2,
        quizCompletionRate: 0.5,
        resultToStoreRate: 0.6667,
      },
    } as AnalyticsDigest["funnel"],
    quizAbandonment: {
      availableFrom: null,
      windows: {
        yesterday: { versions: [] },
        last7Days: { versions: [] },
        previous7Days: { versions: [] },
        last30Days: { versions: [] },
        previous30Days: { versions: [] },
      },
    },
    recommendationFeedback: {
      availableFrom: null,
      windows: Object.fromEntries(
        [
          "yesterday",
          "last7Days",
          "previous7Days",
          "last30Days",
          "previous30Days",
        ].map((key) => [
          key,
          {
            feedbackSessions: 0,
            wouldConsiderSessions: 0,
            needMoreConfidenceSessions: 0,
            notAFitSessions: 0,
            wouldConsiderRate: null,
            feedbackResponseRate: null,
            reasonBreakdown: [
              "size_uncertainty",
              "board_uncertainty",
              "explanation_insufficient",
              "price_or_offer",
              "preference_mismatch",
              "other",
            ].map((reason) => ({ reason, sessions: 0 })),
          },
        ]),
      ) as AnalyticsDigest["recommendationFeedback"]["windows"],
    },
    commerce: {
      windows: { last30Days: { clickEvents: 3, uniqueClickSessions: 2 } } as AnalyticsDigest["commerce"]["windows"],
      merchants30Days: [],
      placements30Days: [],
      topBoards30Days: [],
      topOffers30Days: [],
    },
    trends: {} as AnalyticsDigest["trends"],
    partnerReadiness: { score: 20, status: "early" } as AnalyticsDigest["partnerReadiness"],
    dataQuality: [],
    sampling: {} as AnalyticsDigest["sampling"],
    delivery: { contentHash },
    ...overrides,
  };
}

function ledgerRow(digest = makeServerDigest()) {
  return {
    logicalId: digest.logicalId,
    kind: digest.kind,
    digest,
    digestStatus: digest.status,
    evidenceHash: digest.sourceReport.evidenceHash,
    contentHash: digest.delivery.contentHash,
    deliveryStatus: "pending" as const,
    attemptCount: 1,
    leaseToken: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
    lastAttemptAt: new Date("2026-08-10T05:00:00Z"),
    lastErrorCategory: null,
    createdAt: new Date("2026-08-10T05:00:00Z"),
  };
}

function makeDependencies(input: {
  env?: Record<string, string | undefined>;
  digest?: AnalyticsDigest;
  repository?: Partial<AnalyticsDeliveryRepository>;
  mailer?: Partial<AnalyticsMailer>;
  events?: string[];
} = {}) {
  const events = input.events ?? [];
  const digest = input.digest ?? makeServerDigest();
  const repository: AnalyticsDeliveryRepository = {
    claim: vi.fn(async () => {
      events.push("claim-committed");
      return {
        status: "claimed" as const,
        logicalId: digest.logicalId,
        digest,
        leaseToken: "00000000-0000-4000-8000-000000000001",
        attemptCount: 1,
      };
    }),
    finish: vi.fn(async (_claim, sentDigest, outcome) => {
      events.push("finish-transaction");
      if (outcome.type === "success") {
        return {
          status: sentDigest.status === "complete" ? ("sent" as const) : ("partial_sent" as const),
          logicalId: sentDigest.logicalId,
        };
      }
      return { status: "pending" as const, logicalId: sentDigest.logicalId, category: outcome.category };
    }),
    listDue: vi.fn(async () => []),
    reject: vi.fn(async () => undefined),
    cleanup: vi.fn(async () => 0),
    ...input.repository,
  };
  const mailer: AnalyticsMailer = {
    send: vi.fn(async () => {
      events.push("provider-send");
      return { data: { id: "email_1" }, error: null };
    }),
    ...input.mailer,
  };
  const dependencies: AnalyticsDeliveryDependencies = {
    env: {
      ANALYTICS_DELIVERY_ENABLED: "true",
      RESEND_API_KEY: "re_super_secret_test_key",
      ANALYTICS_DELIVERY_SENDER: "sender@example.test",
      ANALYTICS_DELIVERY_RECIPIENT: "owner-secret@example.test",
      CRON_SECRET: "cron-test-secret",
      ...input.env,
    },
    reportLoader: vi.fn(async () => digest as never),
    repositoryFactory: vi.fn(() => repository),
    mailerFactory: vi.fn(() => mailer),
    logger: { info: vi.fn(), error: vi.fn() },
  };
  return { dependencies, repository, mailer, events };
}

describe("analytics delivery server safety boundary", () => {
  it.each(["daily", "weekly", "retry"] as const)(
    "returns disabled after auth with zero report, DB and provider calls for %s",
    async (kind) => {
      const { dependencies } = makeDependencies({
        env: { ANALYTICS_DELIVERY_ENABLED: "false" },
      });
      const response = await handleAnalyticsCronRequest(
        kind,
        new Request("https://example.test", {
          headers: { authorization: "Bearer cron-test-secret" },
        }),
        dependencies,
      );
      expect(response).toEqual({ httpStatus: 200, result: { status: "disabled" } });
      expect(dependencies.reportLoader).not.toHaveBeenCalled();
      expect(dependencies.repositoryFactory).not.toHaveBeenCalled();
      expect(dependencies.mailerFactory).not.toHaveBeenCalled();
    },
  );

  it("rejects requests before checking feature or dependencies", async () => {
    const { dependencies } = makeDependencies();
    const missing = await handleAnalyticsCronRequest(
      "daily",
      new Request("https://example.test"),
      { ...dependencies, env: { ...dependencies.env, CRON_SECRET: undefined } },
    );
    const wrong = await handleAnalyticsCronRequest(
      "daily",
      new Request("https://example.test", { headers: { authorization: "Bearer wrong" } }),
      dependencies,
    );
    expect(missing).toEqual({
      httpStatus: 500,
      result: { status: "failed", category: "cron_secret_missing" },
    });
    expect(wrong).toEqual({
      httpStatus: 401,
      result: { status: "failed", category: "unauthorized" },
    });
    expect(dependencies.reportLoader).not.toHaveBeenCalled();
  });

  it("returns invalid enabled config without initializing DB or provider", async () => {
    const { dependencies } = makeDependencies({ env: { RESEND_API_KEY: "" } });
    const response = await handleAnalyticsCronRequest(
      "daily",
      new Request("https://example.test", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
      dependencies,
    );
    expect(response.httpStatus).toBe(500);
    expect(response.result).toMatchObject({ category: "delivery_config_missing" });
    expect(dependencies.repositoryFactory).not.toHaveBeenCalled();
    expect(dependencies.mailerFactory).not.toHaveBeenCalled();
  });
});

describe("generated analytics delivery", () => {
  it("claims, sends outside the claim transaction and persists success", async () => {
    const events: string[] = [];
    const { dependencies, mailer } = makeDependencies({ events });
    const result = await runDailyAnalyticsDelivery({
      now: new Date("2026-08-10T06:15:00Z"),
      dependencies,
    });
    expect(result).toEqual({ status: "sent", logicalId: "daily:2026-08-09" });
    expect(events).toEqual(["claim-committed", "provider-send", "finish-transaction"]);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const envelope = vi.mocked(mailer.send).mock.calls[0][0];
    expect(envelope.idempotencyKey).toBe(`edgefit/daily:2026-08-09/${contentHash}`);
  });

  it("maps a partial digest to partial_sent without zero filling", async () => {
    const digest = makeServerDigest({
      status: "partial",
      sourceStatus: {
        firstParty: { status: "ok" },
        metrika: { status: "unavailable", diagnostic: { category: "network" } },
        acquisition: { status: "ok" },
      },
      traffic: { last30Days: null } as AnalyticsDigest["traffic"],
    });
    const { dependencies, mailer } = makeDependencies({ digest });
    const result = await runDailyAnalyticsDelivery({ dependencies });
    expect(result.status).toBe("partial_sent");
    expect(vi.mocked(mailer.send).mock.calls[0][0].message.text).toContain("Status: PARTIAL");
    expect(vi.mocked(mailer.send).mock.calls[0][0].message.text).toContain("Traffic 30d: — users / — visits");
  });

  it("uses the weekly builder identity", async () => {
    const digest = makeServerDigest({ kind: "weekly", logicalId: "weekly:2026-W32" });
    const { dependencies } = makeDependencies({ digest });
    const result = await runWeeklyAnalyticsDelivery({ dependencies });
    expect(result).toMatchObject({ status: "sent", logicalId: "weekly:2026-W32" });
  });

  it("blocks a normal digest when first-party evidence is unavailable", async () => {
    const digest = makeServerDigest({
      sourceStatus: {
        firstParty: { status: "unavailable", diagnostic: { category: "database" } },
        metrika: { status: "ok" },
        acquisition: { status: "ok" },
      },
    });
    const { dependencies, mailer } = makeDependencies({ digest });
    const result = await runDailyAnalyticsDelivery({ dependencies });
    expect(result).toMatchObject({ status: "failed", category: "first_party_unavailable" });
    expect(dependencies.repositoryFactory).not.toHaveBeenCalled();
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mailer.send).mock.calls[0][0].message.attachments).toBeUndefined();
  });

  it("keeps route results and logs free of configured secrets", async () => {
    const { dependencies } = makeDependencies({
      repository: { claim: vi.fn(async () => { throw new Error("postgresql://secret"); }) },
    });
    const response = await handleAnalyticsCronRequest(
      "daily",
      new Request("https://example.test", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
      dependencies,
    );
    const serialized = JSON.stringify({ response, logs: vi.mocked(dependencies.logger.error).mock.calls });
    for (const secret of [
      "re_super_secret_test_key",
      "owner-secret@example.test",
      "cron-test-secret",
      "postgresql://secret",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe("retry and retention orchestration", () => {
  it("reuses a stored immutable digest, generatedAt and original provider key", async () => {
    const digest = makeServerDigest();
    const row = ledgerRow(digest);
    const { dependencies, repository, mailer } = makeDependencies({
      digest,
      repository: { listDue: vi.fn(async () => [row]), cleanup: vi.fn(async () => 2) },
    });
    const result = await runAnalyticsDeliveryRetrySweep({ dependencies });
    expect(result).toMatchObject({ processed: 1, deleted: 2, status: "sent" });
    expect(repository.claim).toHaveBeenCalledWith(digest, expect.any(Date));
    const attachment = vi.mocked(mailer.send).mock.calls[0][0].message.attachments![0];
    const attached = JSON.parse(Buffer.from(attachment.content, "base64").toString("utf8"));
    expect(attached.generatedAt).toBe("2026-08-10T06:15:00.000Z");
    expect(vi.mocked(mailer.send).mock.calls[0][0].idempotencyKey).toBe(
      `edgefit/${digest.logicalId}/${contentHash}`,
    );
  });

  it("rejects an inconsistent stored digest without sending", async () => {
    const digest = makeServerDigest();
    const row = ledgerRow(digest);
    row.contentHash = evidenceHash;
    const { dependencies, repository, mailer } = makeDependencies({
      repository: { listDue: vi.fn(async () => [row]) },
    });
    const result = await runAnalyticsDeliveryRetrySweep({ dependencies });
    expect(result).toMatchObject({ status: "conflict", category: "stored_digest_hash_mismatch" });
    expect(repository.reject).toHaveBeenCalledWith(
      digest.logicalId,
      "stored_digest_hash_mismatch",
      expect.any(Date),
    );
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("does not call the provider for stale sending after the safe window", async () => {
    const now = new Date("2026-08-10T06:15:00Z");
    const digest = makeServerDigest();
    const row = {
      ...ledgerRow(digest),
      deliveryStatus: "sending" as const,
      leaseExpiresAt: new Date("2026-08-09T20:00:00Z"),
      lastAttemptAt: new Date("2026-08-09T07:15:00Z"),
      lastErrorCategory: null,
    };
    const { dependencies, mailer } = makeDependencies({
      repository: {
        listDue: vi.fn(async () => [row]),
        claim: vi.fn(async (storedDigest, claimNow) => {
          const decision = getAnalyticsDeliveryClaimDecision(row, storedDigest, claimNow);
          return {
            status: decision.action === "fail" ? ("failed" as const) : ("claimed" as const),
            logicalId: storedDigest.logicalId,
            category: decision.action === "fail" ? decision.category : undefined,
          };
        }),
      },
    });
    const result = await runAnalyticsDeliveryRetrySweep({ now, dependencies });
    expect(result).toMatchObject({
      status: "failed",
      category: "provider_outcome_unknown_expired",
    });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("requests only the bounded retry and cleanup batch sizes", async () => {
    const { dependencies, repository } = makeDependencies();
    await runAnalyticsDeliveryRetrySweep({ dependencies });
    expect(repository.listDue).toHaveBeenCalledWith(expect.any(Date), 10);
    expect(repository.cleanup).toHaveBeenCalledWith(expect.any(Date), 100);
  });
});

describe("production repository contract", () => {
  it("keeps structured JSON, advisory locking, bounded queries and provider I/O outside SQL", () => {
    const source = readFileSync(new URL("./delivery-server.ts", import.meta.url), "utf8");
    expect(source).toContain("pg_advisory_xact_lock(hashtextextended(${digest.logicalId}, 0))");
    expect(source).toContain("tx.json(digest as unknown as Parameters<typeof tx.json>[0])");
    expect(source).not.toContain("JSON.stringify(digest)");
    expect(source).toContain("limit ${safeLimit}");
    expect(source.indexOf("await mailer.send(envelope)")).toBeGreaterThan(
      source.indexOf("export function createPostgresAnalyticsDeliveryRepository"),
    );
  });
});
