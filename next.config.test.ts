import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "./next.config";

describe("legacy public host migration through Next routing", () => {
  it.each(["/", "/catalog", "/boards/test-board", "/robots.txt", "/sitemap.xml",
    "/catalog?style=park&brand=Jones&sort=price", "/quiz?board=test-board&utm_source=manual",
    "/apiary", "/governance", "/internal-guide", "/google10fccbce44c29493Xhtml", "/health-check",
  ])("permanently preserves path and query: %s", async (path) => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://edge-fit.vercel.app${path}`, nextConfig });
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`https://snowdex.ru${path}`);
  });
  it.each(["snowdex.ru", "www.snowdex.ru", "edgefit-abc-team.vercel.app", "edgefit-git-feature-team.vercel.app",
    "edge-fit.vercel.app.evil.test", "edge-fitXvercelXapp",
  ])("does not redirect canonical, preview, or lookalike host %s", async (host) => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://${host}/catalog?q=1`, nextConfig });
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
  it.each(["/google10fccbce44c29493.html", "/google10fccbce44c29493.html?x=1", "/api", "/api/internal/report",
    "/api/catalog-import", "/go", "/go/test-board?sizeLabel=159W", "/internal", "/internal/login", "/internal/catalog",
    "/_next", "/_next/static/test.js", "/health", "/health?probe=1",
  ])("leaves ownership and service path %s untouched", async (path) => {
    const response = await unstable_getResponseFromNextConfig({ url: `https://edge-fit.vercel.app${path}`, nextConfig });
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
  it("preserves verification bytes and internal middleware implementation", () => {
    const base = "52b8ae54cce8e045579acd7ac48b4aa7269b08dd";
    for (const path of ["public/google10fccbce44c29493.html", "middleware.ts"]) {
      expect(readFileSync(path)).toEqual(execFileSync("git", ["show", `${base}:${path}`]));
    }
  });
});
