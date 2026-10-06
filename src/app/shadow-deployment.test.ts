import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("shadow deployment build contract", () => {
  it("enables saved results in builder and runner and verifies actual build artifacts", () => {
    const docker = source("Dockerfile");
    const builder = docker.split("FROM base AS builder")[1].split("FROM base AS runner")[0];
    const runner = docker.split("FROM base AS runner")[1];
    expect(builder).toContain("SAVED_RESULTS_ENABLED=true");
    expect(runner).toContain("SAVED_RESULTS_ENABLED=true");
    expect(builder).toContain('DATABASE_URL=" "');
    expect(builder).toContain("RUN npm run build && node scripts/verify-saved-result-build.mjs");
    expect(docker).not.toMatch(/ARG\s+SAVED_RESULTS_ENABLED/u);
    for (const secret of ["CRON_SECRET", "INTERNAL_ACCESS_SECRET", "INTERNAL_ACCESS_PASSWORD", "RESEND_API_KEY", "YANDEX_METRIKA_OAUTH_TOKEN"]) {
      expect(builder).not.toContain(secret);
      expect(runner).not.toContain(secret);
    }
    expect(source("src/app/result/page.tsx")).not.toContain("force-dynamic");
  });
  it("leaves normal deployment output and headers unchanged", async () => {
    vi.stubEnv("SNOWDEX_SHADOW_MODE", "");
    vi.stubEnv("SNOWDEX_STANDALONE", "");
    vi.stubEnv("NEXT_PUBLIC_HOSTING_PROVIDER", "");
    const { default: config } = await import("../../next.config");
    expect(config.output).toBeUndefined();
    expect(await config.headers!()).toEqual([]);
  });

  it("opts into standalone and protects every shadow response from indexing", async () => {
    vi.stubEnv("SNOWDEX_SHADOW_MODE", "true");
    vi.stubEnv("SNOWDEX_STANDALONE", "true");
    vi.stubEnv("NEXT_PUBLIC_HOSTING_PROVIDER", "vercel");
    const { default: config } = await import("../../next.config");
    expect(config.output).toBe("standalone");
    expect(await config.headers!()).toEqual([{ source: "/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ] }]);
    const redirects = await config.redirects!();
    expect(redirects).toHaveLength(1);
    expect(redirects[0].has).toEqual([{ type: "host", value: "edge-fit\\.vercel\\.app" }]);
    expect(redirects[0].destination).toBe("https://snowdex.ru/:path");
    expect(redirects[0].permanent).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://snowdex.ru");
    expect(getAbsoluteSiteUrl("/catalog")).toBe("https://snowdex.ru/catalog");
  });

  it("pins the runtime, copies assets and starts a non-root Node process", () => {
    const docker = source("Dockerfile");
    expect(docker).toMatch(/FROM node:24\.21\.0-bookworm-slim@sha256:[a-f0-9]{64} AS base/);
    expect(docker).toContain("RUN npm ci");
    expect(docker).toContain("/app/.next/standalone ./");
    expect(docker).toContain("/app/.next/static ./.next/static");
    expect(docker).toContain("/app/public ./public");
    expect(docker).toContain("--chown=snowdex:snowdex");
    expect(docker).toContain("USER snowdex");
    expect(docker).toContain("EXPOSE 3000");
    expect(docker).toContain('CMD ["node", "server.js"]');
    expect(docker).not.toMatch(/^\s*HEALTHCHECK\b/imu);
    expect(docker).not.toMatch(/ARG\s+(DATABASE_URL|RESEND_API_KEY|INTERNAL_ACCESS_SECRET)/);
    expect(docker).not.toContain("next dev");
  });

  it("installs only the HTTP probe client in the runner before dropping privileges", () => {
    const stages = source("Dockerfile").split("FROM base AS runner");
    expect(stages).toHaveLength(2);
    const [buildStages, runner] = stages;
    expect(buildStages).not.toMatch(/apt-get|curl --version/);
    const install = "RUN apt-get update \\\n    && apt-get install -y --no-install-recommends curl \\\n    && rm -rf /var/lib/apt/lists/* \\\n    && curl --version";
    expect(runner.replace(/\r\n/gu, "\n")).toContain(install);
    expect(runner.indexOf("curl --version")).toBeLessThan(runner.indexOf("USER snowdex"));
    expect(runner.match(/apt-get install/gu)).toHaveLength(1);
    expect(runner).not.toMatch(/\b(wget|gcc|make|build-essential)\b/u);
  });

  it("excludes secrets and local artifacts while retaining cron source dependencies", () => {
    const ignored = source(".dockerignore").split(/\r?\n/u);
    for (const pattern of [".env*", ".git", ".vercel", "node_modules", ".next", "reports"]) {
      expect(ignored).toContain(pattern);
    }
    expect(ignored).not.toContain("scripts");
    const runner = source("Dockerfile").split("FROM base AS runner")[1];
    expect(runner).not.toMatch(/DATABASE_URL|RESEND_API_KEY|INTERNAL_ACCESS_SECRET/);
  });

  it("keeps cache TTLs, algorithm and protected host migration", () => {
    expect(source("src/app/sitemap.ts")).toContain('export const dynamic = "force-dynamic"');
    expect(source("src/lib/public-catalog-cache.ts")).toContain("PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS = 300");
    expect(source("src/lib/public-board-cache.ts")).toContain("revalidate: 3600");
    expect(source("src/lib/public-schema-cache.ts")).toContain("revalidate: 3600");
    expect(source("src/lib/recommendation/engine.ts")).toContain('"v1.6.4"');
    expect(source("next.config.ts")).toContain("_next(?:/|$)");
    expect(source("src/app/layout.tsx")).not.toContain("SNOWDEX_SHADOW_MODE");
    expect(source("Dockerfile")).toContain("SNOWDEX_STANDALONE=true");
    expect(source("Dockerfile")).toContain("SNOWDEX_SHADOW_MODE=false");
    expect(source("Dockerfile")).toContain("NEXT_PUBLIC_HOSTING_PROVIDER=timeweb");
    expect(source("Dockerfile").match(/ARG NEXT_PUBLIC_YANDEX_METRIKA_ID="108458449"/gu)).toHaveLength(2);
  });
});
