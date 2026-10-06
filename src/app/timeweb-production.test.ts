import { afterEach, describe, expect, it, vi } from "vitest";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
async function config(provider = "timeweb", standalone = "true", shadow = "false") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_HOSTING_PROVIDER", provider);
  vi.stubEnv("SNOWDEX_STANDALONE", standalone);
  vi.stubEnv("SNOWDEX_SHADOW_MODE", shadow);
  return (await import("../../next.config")).default;
}
describe("Timeweb production host routing", () => {
  it("separates packaging, provider and global shadow indexing", async () => {
    const production = await config(); expect(production.output).toBe("standalone");
    const shadow = await config("vercel", "", "true"); expect(shadow.output).toBeUndefined();
    expect(await shadow.headers!()).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }]);
    const vercel = await config("vercel", "", "false");
    expect(vercel.output).toBeUndefined(); expect(await vercel.headers!()).toEqual([]);
    expect(await vercel.redirects!()).toHaveLength(1);
    await expect(config("invalid")).rejects.toThrow("NEXT_PUBLIC_HOSTING_PROVIDER");
  });
  it.each(["/", "/catalog", "/robots.txt", "/sitemap.xml", "/health", "/_next/static/app.js", "/google10fccbce44c29493.html"])(
    "keeps production indexable and technical/lookalike hosts noindex for %s", async path => {
      const nextConfig = await config();
      for (const host of ["snowdex.ru", "notlimitgb-edgefit-0277.twc1.net", "snowdex.ru.evil.test", "preview.vercel.app"]) {
        const response = await unstable_getResponseFromNextConfig({ url: `https://${host}${path}`, nextConfig });
        expect(response.status).toBe(200);
        expect(response.headers.get("x-robots-tag")).toBe(host === "snowdex.ru" ? null : "noindex, nofollow, noarchive");
      }
    });
  // Next's experimental config helper stringifies array query values with commas.
  // Repeated brand parameters are verified against the actual standalone HTTP server.
  it.each(["/", "/catalog?brand=CAPiTA&style=freeride", "/boards/yes-basic", "/robots.txt", "/sitemap.xml"])(
    "redirects exact www with path/query intact: %s", async path => {
      const response = await unstable_getResponseFromNextConfig({ url: `https://www.snowdex.ru${path}`, nextConfig: await config() });
      expect(response.status).toBe(308); expect(response.headers.get("location")).toBe(`https://snowdex.ru${path}`);
      expect(response.headers.get("x-robots-tag")).toBeNull();
    });
  it.each(["/api/analytics", "/api/cron/catalog-refresh", "/go/yes-basic?sizeLabel=159W", "/internal/login", "/health?probe=1", "/_next/static/app.js", "/google10fccbce44c29493.html"])(
    "leaves www service routes unchanged: %s", async path => {
      const response = await unstable_getResponseFromNextConfig({ url: `https://www.snowdex.ru${path}`, nextConfig: await config() });
      expect(response.status).toBe(200); expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-robots-tag")).toBeNull();
    });
  it("does not trust a forwarded canonical host", async () => {
    const response = await unstable_getResponseFromNextConfig({ url: "https://notlimitgb-edgefit-0277.twc1.net/", headers: { "x-forwarded-host": "snowdex.ru" }, nextConfig: await config() });
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });
});
