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
const monday = new Date("2026-11-09T06:30:00Z");

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
    const hasMissed = vi.fn().mockResolvedValue(true);
    const result = await runDirectDelivery("weekly", { env, now: monday, hasMissed });
    expect(result).toEqual({ status: "failed", category: "missed_week_reconciliation_required" });
    expect(hasMissed).toHaveBeenCalledWith("2026-11-02");
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it("rejects non-Monday and the historical W44 recovery period", async () => {
    expect((await runDirectDelivery("weekly", { env, now: new Date("2026-11-10T06:30:00Z") })).status).toBe("failed");
    expect((await runDirectDelivery("weekly", { env, now: new Date("2026-11-02T06:30:00Z") })).category).toBe("historical_week_not_supported");
    expect(mocks.weekly).not.toHaveBeenCalled();
  });
  it("passes a frozen reporting clock and disallows failure email notices", async () => {
    mocks.weekly.mockResolvedValue({ status: "sent", logicalId: "weekly:2026-W45" });
    expect((await runDirectDelivery("weekly", { env, now: monday, hasMissed: async () => false })).status).toBe("sent");
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
    const result = await runDirectDelivery("weekly", { env, now: monday, hasMissed: async () => false });
    expect(result.status).toBe("failed");
    expect(claim).not.toHaveBeenCalled();
  });
  it("returns safe error categories without logging secret-bearing exceptions", async () => {
    const result = await runDirectDelivery("weekly", { env, now: monday, hasMissed: async () => { throw new Error("synthetic-secret"); } });
    expect(result).toEqual({ status: "failed", category: "direct_execution_failed" });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });
  it("never passes a due W44 to the retry sweep and preserves historical rows", async () => {
    const cleanup = vi.fn();
    const listDue = vi.fn().mockResolvedValue([{ logicalId: "weekly:2026-W44" }, { logicalId: "weekly:2026-W45" }]);
    const dependencies = { env, repositoryFactory: () => ({ listDue, cleanup }),
      reportLoader: mocks.report, mailerFactory: vi.fn(), logger: console } as unknown as AnalyticsDeliveryDependencies;
    mocks.retry.mockImplementationOnce(async ({ dependencies: guarded, now }) => {
      const repository = guarded.repositoryFactory({});
      expect(await repository.listDue(now, 10)).toEqual([{ logicalId: "weekly:2026-W45" }]);
      expect(await repository.cleanup(now, 100)).toBe(0);
      return { status: "noop" };
    });
    expect(await runDirectDelivery("retry", { env, now: monday, dependencies })).toEqual({
      status: "failed", category: "historical_w44_requires_owner_action",
    });
    expect(cleanup).not.toHaveBeenCalled();
  });
});
