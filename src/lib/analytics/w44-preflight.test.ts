import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ build: vi.fn(), load: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/digest", () => ({ buildWeeklyAnalyticsDigest: mocks.build }));
vi.mock("@/lib/analytics/reporting-server", () => ({ getAnalyticsReport: mocks.load }));

import { preflightW44 } from "./w44-preflight";
import { buildReportWindows } from "./reporting-core";

const env = { CRON_SECRET: "test-secret", ANALYTICS_W44_PREFLIGHT_ENABLED: "true" };
const makeDigest = () => ({
  logicalId: "weekly:2026-W44", status: "complete",
  periods: { last7Days: { startDate: "2026-10-26", endDate: "2026-11-01" } },
  sourceStatus: { firstParty: { status: "ok" }, metrika: { status: "ok" }, acquisition: { status: "ok" } },
});

beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue({}); mocks.build.mockReturnValue(makeDigest()); });
describe("W44 read-only preflight", () => {
  it("requires configured cron authorization and an independent gate", async () => {
    expect((await preflightW44(null, {})).httpStatus).toBe(500);
    expect((await preflightW44("Bearer wrong", env)).httpStatus).toBe(401);
    expect((await preflightW44("Bearer test-secret", { CRON_SECRET: "test-secret" })).httpStatus).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("uses the fixed Moscow window and reports only source status", async () => {
    const result = await preflightW44("Bearer test-secret", env);
    const now = mocks.load.mock.calls[0][0].now as Date;
    expect(buildReportWindows(now).windows.last7Days).toEqual({ startDate: "2026-10-26", endDate: "2026-11-01" });
    expect(result).toMatchObject({ httpStatus: 200, body: { logicalId: "weekly:2026-W44", status: "complete" } });
    expect(JSON.stringify(result)).not.toContain("test-secret");
  });
  it("rejects incorrect identity and period", async () => {
    mocks.build.mockReturnValueOnce({ ...makeDigest(), logicalId: "weekly:2026-W45" });
    expect((await preflightW44("Bearer test-secret", env)).httpStatus).toBe(409);
    mocks.build.mockReturnValueOnce({ ...makeDigest(), periods: { last7Days: { startDate: "2026-10-27", endDate: "2026-11-01" } } });
    expect((await preflightW44("Bearer test-secret", env)).httpStatus).toBe(409);
  });
  it("reports unavailable sources and does not create a mailer or ledger", async () => {
    mocks.build.mockReturnValueOnce({ ...makeDigest(), status: "partial", sourceStatus: { firstParty: { status: "unavailable" } } });
    expect((await preflightW44("Bearer test-secret", env)).body.status).toBe("partial");
    mocks.load.mockRejectedValueOnce(new Error("private"));
    expect((await preflightW44("Bearer test-secret", env)).body).toEqual({ status: "failed", category: "historical_preflight_failed" });
  });
});
