import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { expectedWeeklyId, HTTP_TIMEOUT_MS, invokeAnalyticsScheduler } from "../../../scripts/analytics-scheduler.mjs";

const monday = new Date("2026-11-02T06:30:00Z");

describe("analytics scheduler", () => {
  it("serializes both scheduled invocations and uses only the cron secret", () => {
    const workflow = readFileSync(".github/workflows/analytics-delivery.yml", "utf8");
    expect(workflow).toContain("30 6 * * 1");
    expect(workflow).toContain("15 8 * * *");
    expect(workflow).toContain("group: snowdex-analytics-delivery");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("'workflow_dispatch::weekly'");
    expect(workflow).toContain("'workflow_dispatch::retry'");
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(workflow.match(/secrets\.[A-Z_]+/g)).toEqual(["secrets.CRON_SECRET"]);
  });
  it("uses the fixed endpoint and rejects missing credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"status":"sent","logicalId":"weekly:2026-W44"}', { status: 200 }));
    expect(await invokeAnalyticsScheduler("weekly", "example", fetcher, monday)).toBe("sent");
    expect(fetcher.mock.calls[0][0]).toBe("https://snowdex.ru/api/cron/analytics-weekly");
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(HTTP_TIMEOUT_MS).toBe(420_000);
    await expect(invokeAnalyticsScheduler("weekly", "", fetcher)).rejects.toThrow();
  });
  it.each(["disabled", "failed", "conflict", "pending", "busy", "unexpected"])("fails for %s", async (status) => {
    await expect(invokeAnalyticsScheduler("retry", "example", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status })) ))).rejects.toThrow();
  });
  it("fails for authorization errors and malformed responses", async () => {
    await expect(invokeAnalyticsScheduler("retry", "example", vi.fn().mockResolvedValue(new Response('{"status":"noop"}', { status: 401 })))).rejects.toThrow();
    await expect(invokeAnalyticsScheduler("retry", "example", vi.fn().mockResolvedValue(new Response("not json")))).rejects.toThrow();
  });
  it("permits only Moscow Monday and rejects week and year rollover errors", () => {
    expect(expectedWeeklyId(monday)).toBe("weekly:2026-W44");
    expect(expectedWeeklyId(new Date("2026-11-09T06:30:00Z"))).toBe("weekly:2026-W45");
    expect(expectedWeeklyId(new Date("2021-01-04T06:30:00Z"))).toBe("weekly:2020-W53");
    expect(() => expectedWeeklyId(new Date("2026-11-03T06:30:00Z"))).toThrow("weekly_outside_moscow_monday");
    expect(() => expectedWeeklyId(new Date("2026-11-01T21:05:00Z"))).toThrow("weekly_outside_moscow_monday");
    expect(() => expectedWeeklyId(new Date("2026-11-02T20:45:00Z"))).toThrow("weekly_outside_moscow_monday");
  });
  it("does not dispatch a weekly request outside the permitted window", async () => {
    const fetcher = vi.fn();
    await expect(invokeAnalyticsScheduler("weekly", "example", fetcher, new Date("2026-11-03T06:30:00Z"))).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(invokeAnalyticsScheduler("other", "example", fetcher, monday)).rejects.toThrow();
  });
  it("rejects unexpected weekly identity and transport/body failures", async () => {
    await expect(invokeAnalyticsScheduler("weekly", "example", vi.fn().mockResolvedValue(new Response('{"status":"sent","logicalId":"weekly:2026-W45"}')), monday)).rejects.toThrow("scheduler_period_mismatch");
    await expect(invokeAnalyticsScheduler("retry", "example", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")))).rejects.toThrow();
    await expect(invokeAnalyticsScheduler("retry", "example", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new Error("body failed")) }))).rejects.toThrow("scheduler_response_invalid");
  });
  it("uses one bounded request and propagates timeout without retrying", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
    const fetcher = vi.fn<typeof fetch>((_url, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")));
    }));
    const request = invokeAnalyticsScheduler("retry", "example", fetcher);
    const rejected = expect(request).rejects.toThrow();
    controller.abort();
    await rejected;
    expect(timeout).toHaveBeenCalledWith(420_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    timeout.mockRestore();
  });
});
