import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  report: vi.fn(), build: vi.fn(), weekly: vi.fn(), retry: vi.fn(), client: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/client", () => ({ получитьКлиентБазы: mocks.client }));
vi.mock("@/lib/analytics/reporting-server", () => ({ getAnalyticsReport: mocks.report }));
vi.mock("@/lib/analytics/digest", () => ({ buildWeeklyAnalyticsDigest: mocks.build }));
vi.mock("@/lib/analytics/delivery-server", () => ({
  createPostgresAnalyticsDeliveryRepository: vi.fn(), createResendAnalyticsMailer: vi.fn(),
  runWeeklyAnalyticsDelivery: mocks.weekly, runAnalyticsDeliveryRetrySweep: mocks.retry,
}));
import { runDirectDelivery, validateDirectConfig } from "./direct-runner";
import type { AnalyticsDeliveryDependencies } from "./delivery-server";

const env = { ANALYTICS_DELIVERY_ENABLED: "true", DATABASE_URL: "postgres://synthetic.invalid/db",
  DATABASE_SSL: "require", RESEND_API_KEY: "synthetic-key", ANALYTICS_DELIVERY_SENDER: "a@example.test",
  ANALYTICS_DELIVERY_RECIPIENT: "b@example.test", YANDEX_METRIKA_OAUTH_TOKEN: "synthetic-token",
  NEXT_PUBLIC_YANDEX_METRIKA_ID: "123" };
const monday = new Date("2026-11-23T06:30:00Z");
const missing = [{ logicalId: "weekly:2026-W44", historical: true }];

beforeEach(() => { vi.clearAllMocks(); });
describe("direct runner", () => {
  it("fails closed for disabled or incomplete configuration and invalid operation", async () => {
    expect(validateDirectConfig({}, "weekly")).toBe("delivery_disabled");
    expect(validateDirectConfig({ ANALYTICS_DELIVERY_ENABLED: "true" }, "weekly")).toBe("delivery_config_missing");
    expect(validateDirectConfig({ ...env, DATABASE_SSL: "disable" }, "weekly")).toBe("database_config_invalid");
    expect(validateDirectConfig({ ...env, YANDEX_METRIKA_OAUTH_TOKEN: "" }, "weekly")).toBe("metrika_config_invalid");
    expect(validateDirectConfig(env, "bad")).toBe("invalid_operation");
    expect((await runDirectDelivery("weekly", { env: {}, now: monday })).status).toBe("failed");
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it("does not generate the current week if an earlier week is missing", async () => {
    const findMissed = vi.fn().mockResolvedValue(missing);
    const result = await runDirectDelivery("weekly", { env, now: monday, findMissed });
    expect(result).toEqual({ status: "failed", category: "missed_week_reconciliation_required" });
    expect(findMissed).toHaveBeenCalledWith("2026-11-16");
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it("allows the current week's delivery only after all historical gaps are explicitly reconciled", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const dependencies = { env, logger } as unknown as AnalyticsDeliveryDependencies;
    const findMissed = async () => [...missing, { logicalId: "weekly:2026-W45", historical: true }];
    const options = { now: monday, dependencies, findMissed };
    const configured = { ...env, ANALYTICS_HISTORICAL_NO_REPLAY: "2026-W44:provider_unverified" };
    expect((await runDirectDelivery("weekly", { ...options, env: configured })).category).toBe("missed_week_reconciliation_required");
    expect(mocks.weekly).not.toHaveBeenCalled();
    mocks.weekly.mockResolvedValueOnce({ status: "sent", logicalId: "weekly:2026-W47" });
    expect((await runDirectDelivery("weekly", {
      ...options, env: { ...configured, ANALYTICS_HISTORICAL_NO_REPLAY: "2026-W44:provider_unverified,2026-W45:sources_incomplete" },
    })).status).toBe("sent");
    expect(logger.info).toHaveBeenCalledWith("analytics_weekly_coverage_gap", {
      logicalIds: ["weekly:2026-W44", "weekly:2026-W45"],
    });
    expect(logger.info).toHaveBeenCalledWith("analytics_historical_closed_without_replay", {
      logicalId: "weekly:2026-W44", reason: "provider_unverified",
    });
  });
  it.each([
    "2026-W43:provider_unverified",
    "2026-W47:sources_incomplete",
    "2026-W44",
    "2026-W44:secret-canary",
    "2026-W44:provider_unverified,2026-W44:sources_incomplete",
    "2026-W46:sources_incomplete:unexpected",
  ])("rejects malformed or out-of-scope no-replay values", async (value) => {
    const findMissed = vi.fn();
    const result = await runDirectDelivery("weekly", {
      env: { ...env, ANALYTICS_HISTORICAL_NO_REPLAY: value }, now: monday, findMissed,
    });
    expect(result).toEqual({ status: "failed", category: "historical_closure_config_invalid" });
    expect(findMissed).not.toHaveBeenCalled();
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it("suppresses replay for an explicitly closed week even with both recovery gates enabled", async () => {
    const readLedger = vi.fn();
    const options = {
      env: { ...env, ANALYTICS_HISTORICAL_RECOVERY_ENABLED: "true", ANALYTICS_HISTORICAL_NO_REPLAY: "2026-W44:prior_delivery_confirmed" },
      now: monday, historicalWeek: "2026-W44", providerChecked: true, readLedger,
    };
    expect(await runDirectDelivery("historical-audit", options)).toEqual({
      status: "noop", logicalId: "weekly:2026-W44", category: "historical_closed_without_replay",
    });
    expect(await runDirectDelivery("historical-recover", options)).toEqual({
      status: "failed", logicalId: "weekly:2026-W44", category: "historical_closed_without_replay",
    });
    expect(readLedger).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it("rejects non-Monday and the historical W44 recovery period", async () => {
    expect((await runDirectDelivery("weekly", { env, now: new Date("2026-11-10T06:30:00Z") })).status).toBe("failed");
    expect((await runDirectDelivery("weekly", { env, now: new Date("2026-11-02T06:30:00Z") })).category).toBe("historical_week_not_supported");
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it("passes a frozen reporting clock and disallows failure email notices", async () => {
    mocks.weekly.mockResolvedValue({ status: "sent", logicalId: "weekly:2026-W47" });
    expect((await runDirectDelivery("weekly", { env, now: monday, findMissed: async () => [] })).status).toBe("sent");
    expect(mocks.weekly.mock.calls[0][0]).toMatchObject({ now: monday, dependencies: { failureNotices: false } });
  });
  it("checks the loaded report identity before the delivery path can claim or send", async () => {
    const claim = vi.fn();
    mocks.report.mockResolvedValue({});
    mocks.build.mockReturnValue({ logicalId: "weekly:2026-W44", periods: { last7Days: { startDate: "2026-10-26" } } });
    mocks.weekly.mockImplementationOnce(async ({ dependencies, now }) => {
      try { await dependencies.reportLoader({ now }); claim(); }
      catch { return { status: "failed", category: "report_generation_failed" }; }
      return { status: "sent", logicalId: "weekly:2026-W45" };
    });
    const result = await runDirectDelivery("weekly", { env, now: monday, findMissed: async () => [] });
    expect(result.status).toBe("failed");
    expect(claim).not.toHaveBeenCalled();
  });
  it("returns safe error categories without logging secret-bearing exceptions", async () => {
    const result = await runDirectDelivery("weekly", { env, now: monday, findMissed: async () => { throw new Error("synthetic-secret"); } });
    expect(result).toEqual({ status: "failed", category: "direct_execution_failed" });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });
  it("scopes the scheduled retry query to W47 onward and disables cleanup", async () => {
    const cleanup = vi.fn();
    const listDue = vi.fn().mockResolvedValue([{ logicalId: "weekly:2026-W47" }]);
    const dependencies = { env, repositoryFactory: () => ({ listDue, cleanup }),
      reportLoader: mocks.report, mailerFactory: vi.fn(), logger: console } as unknown as AnalyticsDeliveryDependencies;
    mocks.retry.mockImplementationOnce(async ({ dependencies: guarded, now }) => {
      const repository = guarded.repositoryFactory({});
      expect(await repository.listDue(now, 10)).toEqual([{ logicalId: "weekly:2026-W47" }]);
      expect(listDue).toHaveBeenCalledWith(now, 10, "2026-11-16");
      expect(await repository.cleanup(now, 100)).toBe(0);
      return { status: "noop" };
    });
    expect(await runDirectDelivery("retry", { env, now: monday, dependencies })).toEqual({
      status: "noop",
    });
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("reports a missed recurring week while allowing the current week's delivery", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const dependencies = { env, logger } as unknown as AnalyticsDeliveryDependencies;
    mocks.weekly.mockResolvedValueOnce({ status: "sent", logicalId: "weekly:2026-W48" });
    const result = await runDirectDelivery("weekly", {
      env, now: new Date("2026-11-30T06:30:00Z"), dependencies,
      findMissed: async () => [{ logicalId: "weekly:2026-W47", historical: false }],
    });
    expect(result.status).toBe("sent");
    expect(logger.info).toHaveBeenCalledWith("analytics_weekly_coverage_gap", { logicalIds: ["weekly:2026-W47"] });
  });
  it("uses Monday's scheduled retry to recover a missing current week without taking over a claim", async () => {
    const readLedger = vi.fn().mockResolvedValue("missing");
    mocks.retry.mockResolvedValueOnce({ status: "noop" });
    mocks.weekly.mockResolvedValueOnce({ status: "sent", logicalId: "weekly:2026-W47" });
    const result = await runDirectDelivery("retry", {
      env, now: monday, scheduledRetry: true, readLedger, findMissed: async () => [],
    });
    expect(result).toEqual({ status: "sent", logicalId: "weekly:2026-W47" });
    expect(readLedger).toHaveBeenCalledExactlyOnceWith("weekly:2026-W47", "2026-11-16");
    expect(mocks.weekly.mock.calls[0][0]).toMatchObject({ now: monday, onlyIfAbsent: true });
  });
  it.each(["sent", "pending", "sending", "failed"])("never generates or takes over an existing %s row on fallback", async (state) => {
    mocks.retry.mockResolvedValueOnce({ status: "noop" });
    const result = await runDirectDelivery("retry", {
      env, now: monday, scheduledRetry: true, readLedger: async () => state, findMissed: async () => [],
    });
    expect(result).toEqual({ status: "noop" });
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it.each([
    [monday, false],
    [new Date("2026-11-24T08:15:00Z"), true],
    [new Date("2026-11-16T08:15:00Z"), true],
  ])("does not use fallback outside the scheduled post-recovery Monday window", async (now, scheduledRetry) => {
    const readLedger = vi.fn().mockResolvedValue("missing");
    mocks.retry.mockResolvedValueOnce({ status: "noop" });
    await runDirectDelivery("retry", { env, now, scheduledRetry, readLedger, findMissed: async () => [] });
    expect(readLedger).not.toHaveBeenCalled();
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it.each([
    ["2026-W44", "2026-10-26", "2026-11-01", "2026-11-02"],
    ["2026-W45", "2026-11-02", "2026-11-08", "2026-11-09"],
    ["2026-W46", "2026-11-09", "2026-11-15", "2026-11-16"],
  ])("audits %s without Resend configuration or delivery", async (week, startDate, endDate, anchor) => {
    const logicalId = `weekly:${week}`;
    mocks.report.mockResolvedValueOnce({});
    mocks.build.mockReturnValueOnce({ logicalId, status: "complete", periods: { last7Days: { startDate, endDate } },
      sourceStatus: { firstParty: { status: "ok" }, metrika: { status: "ok" }, acquisition: { status: "ok" } },
      dataQuality: [], sampling: { traffic: { last7Days: { status: "unsampled" } } } });
    const result = await runDirectDelivery("historical-audit", {
      env: { ...env, RESEND_API_KEY: "", ANALYTICS_DELIVERY_ENABLED: "false" },
      now: monday, historicalWeek: week, readLedger: async () => "missing",
    });
    expect(result).toEqual({ status: "noop", logicalId, category: "historical_sources_ready" });
    expect(mocks.report).toHaveBeenCalledWith({ now: new Date(`${anchor}T06:30:00.000Z`) });
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it("requires separate recovery approval, exact period, a missing ledger row and complete sources", async () => {
    const historicalWeek = "2026-W44";
    const recoveryEnv = { ...env, ANALYTICS_DELIVERY_ENABLED: "false", ANALYTICS_HISTORICAL_RECOVERY_ENABLED: "true" };
    const base = { env: recoveryEnv, now: monday, historicalWeek, providerChecked: true, readLedger: async () => "missing" };
    expect((await runDirectDelivery("historical-recover", { ...base, providerChecked: false })).category).toBe("historical_recovery_not_authorized");
    expect((await runDirectDelivery("historical-recover", { ...base, historicalWeek: "2026-W47" })).category).toBe("historical_period_invalid");
    expect((await runDirectDelivery("historical-recover", { ...base, readLedger: async () => "sending" })).category).toBe("historical_ledger_exists");
    expect((await runDirectDelivery("historical-audit", { ...base, readLedger: async () => "unverified_receipt" })).category).toBe("historical_ledger_exists");
    expect((await runDirectDelivery("historical-recover", { ...base, readLedger: async () => "sent" })).category).toBe("historical_already_sent");
    const digest = { logicalId: "weekly:2026-W44", status: "complete",
      periods: { last7Days: { startDate: "2026-10-26", endDate: "2026-11-01" } } };
    mocks.build.mockReturnValueOnce({ ...digest, status: "partial" });
    expect((await runDirectDelivery("historical-recover", base)).category).toBe("historical_sources_incomplete");
    mocks.build.mockReturnValueOnce({ ...digest, periods: { last7Days: { ...digest.periods.last7Days, endDate: "2026-11-02" } } });
    expect((await runDirectDelivery("historical-recover", base)).category).toBe("weekly_identity_mismatch");
    expect(mocks.weekly).not.toHaveBeenCalled();
    mocks.build.mockReturnValueOnce(digest);
    mocks.weekly.mockResolvedValueOnce({ status: "sent", logicalId: digest.logicalId });
    expect((await runDirectDelivery("historical-recover", base)).status).toBe("sent");
    const invocation = mocks.weekly.mock.calls[0][0];
    expect(invocation.now).toBe(monday);
    expect(invocation.historical.reportNow).toEqual(new Date("2026-11-02T06:30:00Z"));
    expect(invocation.historical.now()).toBe(monday);
    expect(invocation.dependencies.env.ANALYTICS_DELIVERY_ENABLED).toBe("true");
  });
});
