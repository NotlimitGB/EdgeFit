import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadSitemapSlugs = vi.hoisted(() => vi.fn());
vi.mock("next/font/google", () => ({
  Manrope: () => ({ variable: "body-font" }),
  Space_Grotesk: () => ({ variable: "heading-font" }),
}));
vi.mock("@/components/analytics/site-analytics", () => ({ SiteAnalytics: () => null }));
vi.mock("@/lib/public-catalog-cache", () => ({ getPublicCanonicalCatalogItems: async () => [] }));
vi.mock("@/lib/saved-results", () => ({ isSavedResultsEnabled: () => false }));
vi.mock("@/lib/canonical-catalog", () => ({
  getAllCanonicalBoardSlugs: loadSitemapSlugs,
}));
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
import sitemap, { dynamic as sitemapDynamic } from "./sitemap";
import { LEGACY_CANONICAL_BOARD_SLUG_ALIASES } from "@/lib/canonical-board-route";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

beforeEach(() => {
  loadSitemapSlugs.mockReset().mockResolvedValue(["test-board", "bataleon-evil-twin-trial-sport-3131268", "nitro-team-2025-2026", "nitro-team"]);
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
    expect(entries).toHaveLength(21);
    expect(entries.every(({ url }) => new URL(url).origin === "https://snowdex.ru")).toBe(true);
    expect(entries.map(({ url }) => new URL(url).pathname)).toContain("/boards/bataleon-evil-twin-trial-sport-3131268");
    expect(entries.map(({ url }) => new URL(url).pathname)).not.toContain("/boards/bataleon-evil-twin");
    expect(entries.map(({ url }) => new URL(url).pathname)).toContain("/boards/nitro-team");
    expect(entries.map(({ url }) => new URL(url).pathname)).not.toContain("/boards/nitro-team-2025-2026");
  });

  it("recovers runtime sitemap truth after unavailable or empty corpus without a rebuild", async () => {
    expect(sitemapDynamic).toBe("force-dynamic");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    loadSitemapSlugs.mockRejectedValueOnce(new Error("audit-private-db-detail"))
      .mockResolvedValueOnce([]).mockResolvedValueOnce(["runtime-board"]);
    expect(await sitemap()).toHaveLength(18);
    expect(await sitemap()).toHaveLength(18);
    expect((await sitemap()).map(({ url }) => url)).toContain("https://snowdex.ru/boards/runtime-board");
    expect(loadSitemapSlugs).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith("sitemap: canonical-corpus-unavailable; static-routes-only");
    expect(JSON.stringify(log.mock.calls)).not.toContain("audit-private-db-detail");
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
