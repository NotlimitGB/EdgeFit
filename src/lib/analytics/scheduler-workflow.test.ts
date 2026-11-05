import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { invokeAnalyticsScheduler } from "../../../scripts/analytics-scheduler.mjs";

describe("analytics scheduler", () => {
  it("serializes both scheduled invocations and uses only the cron secret", () => {
    const workflow = readFileSync(".github/workflows/analytics-delivery.yml", "utf8");
    expect(workflow).toContain("30 6 * * 1");
    expect(workflow).toContain("15 8 * * *");
    expect(workflow).toContain("group: snowdex-analytics-delivery");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(workflow.match(/secrets\.[A-Z_]+/g)).toEqual(["secrets.CRON_SECRET"]);
  });
  it("uses the fixed endpoint and rejects missing credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"status":"sent"}', { status: 200 }));
    expect(await invokeAnalyticsScheduler("weekly", "example", fetcher)).toBe("sent");
    expect(fetcher.mock.calls[0][0]).toBe("https://snowdex.ru/api/cron/analytics-weekly");
    await expect(invokeAnalyticsScheduler("weekly", "", fetcher)).rejects.toThrow();
  });
  it.each(["disabled", "failed", "conflict", "pending", "busy", "unexpected"])("fails for %s", async (status) => {
    await expect(invokeAnalyticsScheduler("retry", "example", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status })) ))).rejects.toThrow();
  });
  it("fails for authorization errors and malformed responses", async () => {
    await expect(invokeAnalyticsScheduler("retry", "example", vi.fn().mockResolvedValue(new Response('{"status":"noop"}', { status: 401 })))).rejects.toThrow();
    await expect(invokeAnalyticsScheduler("retry", "example", vi.fn().mockResolvedValue(new Response("not json")))).rejects.toThrow();
  });
});
