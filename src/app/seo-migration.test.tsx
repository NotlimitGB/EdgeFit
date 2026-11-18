import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const loadSitemapSlugs = vi.hoisted(() => vi.fn());
const connection = vi.hoisted(() => vi.fn());
vi.mock("next/font/google", () => ({
  Manrope: () => ({ variable: "body-font" }),
  Space_Grotesk: () => ({ variable: "heading-font" }),
}));
vi.mock("@/components/analytics/site-analytics", () => ({ SiteAnalytics: () => null }));
vi.mock("next/server", async (importOriginal) => ({ ...await importOriginal<typeof import("next/server")>(), connection }));
vi.mock("@/lib/public-catalog-cache", () => ({
  getPublicCanonicalCatalogItems: async (scope: string) => (await loadSitemapSlugs(scope)).map((slug: string) => ({ slug })),
}));
vi.mock("@/lib/saved-results", () => ({ isSavedResultsEnabled: () => false }));
import { metadata as root } from "./layout";
import { metadata as home } from "./page";
import { metadata as catalog } from "./catalog/page";
import { metadata as quiz } from "./quiz/page";
import { metadata as about } from "./about/page";
import { metadata as contact } from "./contact/page";
import { metadata as privacy } from "./privacy/page";
import { metadata as terms } from "./terms/page";
import { metadata as result } from "./result/page";
import robots from "./robots";
import sitemap from "@/lib/public-sitemap";
import { GET as getSitemap } from "./sitemap.xml/route";
import { LEGACY_CANONICAL_BOARD_SLUG_ALIASES } from "@/lib/canonical-board-route";
import { getAbsoluteSiteUrl } from "@/lib/site-url";
import { OperationDeadlineError } from "@/lib/operation-deadline";

beforeEach(() => {
  loadSitemapSlugs.mockReset().mockResolvedValue(["test-board", "bataleon-evil-twin-trial-sport-3131268", "nitro-team-2025-2026", "nitro-team"]);
  connection.mockReset().mockResolvedValue(undefined);
  for (const name of ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"]) vi.stubEnv(name, "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("public SnowDex metadata migration", () => {
  it("uses a SnowDex root template without imposing a homepage canonical on children", () => {
    expect(root.title).toEqual({ default: "SnowDex", template: "%s | SnowDex" });
    expect(root.openGraph?.title).toBe("SnowDex");
    expect(root.alternates).toBeUndefined();
  });
  it.each([
    [home, "/"], [catalog, "/catalog"], [quiz, "/quiz"], [about, "/about"],
    [contact, "/contact"], [privacy, "/privacy"], [terms, "/terms"],
  ])("keeps each indexable page self-canonical", (metadata, path) => {
    expect(metadata.alternates?.canonical).toBe(path);
    expect(getAbsoluteSiteUrl(String(metadata.alternates?.canonical))).toBe(`https://snowdex.ru${path}`);
    expect(JSON.stringify(metadata)).not.toContain("EdgeFit");
  });
  it("keeps personalized results non-indexable", () => {
    expect(result.robots).toEqual({ index: false, follow: true });
    expect(result.alternates).toBeUndefined();
    expect(result.description).toContain("SnowDex");
  });
  it("preserves SnowDex origin and robots policy with live board routes", async () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: "https://snowdex.ru/sitemap.xml" });
    const entries = await sitemap();
    expect(loadSitemapSlugs).toHaveBeenCalledWith("sitemap");
    expect(entries).toHaveLength(21);
    expect(entries.every(({ url }) => new URL(url).origin === "https://snowdex.ru")).toBe(true);
    expect(entries.map(({ url }) => new URL(url).pathname)).toContain("/boards/bataleon-evil-twin-trial-sport-3131268");
    expect(entries.map(({ url }) => new URL(url).pathname)).not.toContain("/boards/bataleon-evil-twin");
    expect(entries.map(({ url }) => new URL(url).pathname)).toContain("/boards/nitro-team");
    expect(entries.map(({ url }) => new URL(url).pathname)).not.toContain("/boards/nitro-team-2025-2026");
  });

  it("fails closed on unavailable canonical data rather than serving a partial successful sitemap", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    loadSitemapSlugs.mockRejectedValueOnce(new Error("audit-private-db-detail"))
      .mockResolvedValueOnce([]).mockResolvedValueOnce(["runtime-board"]);
    await expect(sitemap()).rejects.toMatchObject({ code: "SITEMAP_UNAVAILABLE" });
    expect(await sitemap()).toHaveLength(18);
    const runtimeEntries = await sitemap();
    expect(runtimeEntries).toHaveLength(19);
    expect(runtimeEntries.map(({ url }) => url)).toContain("https://snowdex.ru/boards/runtime-board");
    expect(loadSitemapSlugs).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      event: "public_route_failure", route: "sitemap", category: "canonical_corpus_unavailable",
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("audit-private-db-detail");
  });

  it("waits for a request before reading the shared catalog data", async () => {
    const request = Promise.withResolvers<void>();
    connection.mockReturnValueOnce(request.promise);
    const pending = sitemap();
    expect(loadSitemapSlugs).not.toHaveBeenCalled();
    request.resolve();
    await pending;
    expect(loadSitemapSlugs).toHaveBeenCalledOnce();
  });

  it("fails closed and records the shared loader deadline category", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    loadSitemapSlugs.mockRejectedValueOnce(new OperationDeadlineError());
    await expect(sitemap()).rejects.toMatchObject({ code: "SITEMAP_UNAVAILABLE" });
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      event: "public_route_failure", route: "sitemap", category: "operation_deadline",
    }));
  });

  it("frames the public XML response by bytes and retires the upstream connection", async () => {
    loadSitemapSlugs.mockResolvedValueOnce(["test-вход&more"]);
    const response = await getSitemap();
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength(xml, "utf8")));
    expect(response.headers.get("connection")).toBe("close");
    expect(xml).toContain("<loc>https://snowdex.ru/boards/test-%D0%B2%D1%85%D0%BE%D0%B4&amp;more</loc>");
    expect(xml.endsWith("</urlset>\n")).toBe(true);
  });

  it("generates a unique full fixture corpus on SnowDex, excluding only explicit alias sources", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://snowdex.ru");
    vi.stubEnv("VERCEL_URL", "technical-shadow.example");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "technical-shadow.example");
    const targets = Object.values(LEGACY_CANONICAL_BOARD_SLUG_ALIASES);
    const slugs = ["bataleon-evil-twin-trial-sport-3131268", ...targets,
      ...Array.from({ length: 554 }, (_, i) => `fixture-board-${i}`)];
    loadSitemapSlugs.mockResolvedValue([...slugs, ...slugs.slice(0, 5), ...Object.keys(LEGACY_CANONICAL_BOARD_SLUG_ALIASES)]);
    const entries = await sitemap();
    const urls = entries.map(({ url }) => url);
    expect(entries).toHaveLength(576);
    expect(new Set(urls).size).toBe(576);
    const boards = entries.filter(({ url }) => new URL(url).pathname.startsWith("/boards/"));
    expect(boards).toHaveLength(558);
    expect(entries.every(({ url }) => new URL(url).origin === "https://snowdex.ru")).toBe(true);
    for (const slug of slugs) expect(urls).toContain(`https://snowdex.ru/boards/${slug}`);
    for (const slug of Object.keys(LEGACY_CANONICAL_BOARD_SLUG_ALIASES)) {
      expect(urls).not.toContain(`https://snowdex.ru/boards/${slug}`);
    }
    expect(boards.every(({ priority, changeFrequency }) => priority === 0.8 && changeFrequency === "monthly")).toBe(true);
    expect(entries.find(({ url }) => url === "https://snowdex.ru/")).toMatchObject({ priority: 1, changeFrequency: "weekly" });
    expect(urls).toContain("https://snowdex.ru/kalkulyator-snouborda");
  });
});
