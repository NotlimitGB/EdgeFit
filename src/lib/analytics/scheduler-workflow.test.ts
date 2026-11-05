import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { expectedWeeklyId } from "../../../scripts/analytics-scheduler.mjs";

describe("analytics direct workflow", () => {
  it("runs only trusted main events with explicit environment and serialization", () => {
    const workflow = readFileSync(".github/workflows/analytics-delivery.yml", "utf8");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).toContain("environment: analytics-production");
    expect(workflow).toContain("group: snowdex-analytics-delivery");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("30 6 * * 1");
    expect(workflow).toContain("15 8 * * *");
    expect(workflow).toContain("'workflow_dispatch::weekly'");
    expect(workflow).toContain("'workflow_dispatch::retry'");
    expect(workflow).toContain("node scripts/analytics-direct-runner.mjs");
    expect(workflow).not.toContain("CRON_SECRET");
    expect(workflow).not.toContain("/api/cron/");
  });
  it("permits only the immediately preceding ISO week on Moscow Monday", () => {
    expect(expectedWeeklyId(new Date("2026-11-02T06:30:00Z"))).toBe("weekly:2026-W44");
    expect(expectedWeeklyId(new Date("2026-11-09T06:30:00Z"))).toBe("weekly:2026-W45");
    expect(expectedWeeklyId(new Date("2021-01-04T06:30:00Z"))).toBe("weekly:2020-W53");
    expect(() => expectedWeeklyId(new Date("2026-11-03T06:30:00Z"))).toThrow();
    expect(() => expectedWeeklyId(new Date("2026-11-01T21:05:00Z"))).toThrow();
    expect(() => expectedWeeklyId(new Date("2026-11-02T20:45:00Z"))).toThrow();
  });
  it("starts the real standalone entrypoint fail-closed without exposing a secret", () => {
    const run = spawnSync(process.execPath, ["scripts/analytics-direct-runner.mjs", "weekly"], {
      encoding: "utf8", timeout: 20_000,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "test", GITHUB_ACTIONS: "true",
        GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "schedule", ANALYTICS_DELIVERY_ENABLED: "false",
        DATABASE_URL: " ", RESEND_API_KEY: "synthetic-secret-canary" },
    });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("delivery_disabled");
    expect(run.stdout + run.stderr).not.toContain("synthetic-secret-canary");
  }, 25_000);
});
