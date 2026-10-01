import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Manrope: () => ({ variable: "body-font" }),
  Space_Grotesk: () => ({ variable: "heading-font" }),
}));
vi.mock("@/components/analytics/site-analytics", () => ({ SiteAnalytics: () => null }));
vi.mock("@/lib/public-catalog-cache", () => ({ getPublicCanonicalCatalogItems: async () => [] }));
vi.mock("@/lib/saved-results", () => ({ isSavedResultsEnabled: () => false }));
vi.mock("@/lib/canonical-catalog", () => ({
  getAllCanonicalBoardSlugs: async () => ["test-board", "bataleon-evil-twin-trial-sport-3131268", "bataleon-evil-twin"],
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
import sitemap from "./sitemap";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

beforeEach(() => {
  for (const name of ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"]) vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());

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
  it("changes sitemap origin, not inclusion or robots access policy", async () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: "https://snowdex.ru/sitemap.xml" });
    const entries = await sitemap();
    expect(entries).toHaveLength(20);
    expect(entries.every(({ url }) => new URL(url).origin === "https://snowdex.ru")).toBe(true);
    expect(entries.map(({ url }) => new URL(url).pathname)).toContain("/boards/bataleon-evil-twin");
    expect(entries.map(({ url }) => new URL(url).pathname)).not.toContain("/boards/bataleon-evil-twin-trial-sport-3131268");
  });
});
