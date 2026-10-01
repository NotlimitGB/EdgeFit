import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAbsoluteSiteUrl, getConfiguredSiteHosts, getSiteMetadataBase, getSiteUrl } from "./site-url";
import { buildFirstTouchAcquisitionContext } from "./analytics/acquisition-context";

beforeEach(() => {
  for (const name of ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"]) {
    vi.stubEnv(name, "");
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("SnowDex site origin", () => {
  it("defaults canonical metadata and paths to SnowDex", () => {
    expect(getSiteUrl()).toBe("https://snowdex.ru");
    expect(getSiteMetadataBase().href).toBe("https://snowdex.ru/");
    expect(getAbsoluteSiteUrl("/boards/test-board")).toBe("https://snowdex.ru/boards/test-board");
  });
  it("preserves override precedence and normalization", () => {
    vi.stubEnv("VERCEL_URL", "preview.vercel.app/");
    expect(getSiteUrl()).toBe("https://preview.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "production.example/");
    expect(getSiteUrl()).toBe("https://production.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", " https://www.snowdex.ru/// ");
    expect(getSiteUrl()).toBe("https://www.snowdex.ru");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", " ");
    expect(getSiteUrl()).toBe("https://snowdex.ru");
  });
  it("retains both migration hosts for existing self-referral semantics", () => {
    expect(getConfiguredSiteHosts()).toEqual(["edge-fit.vercel.app", "snowdex.ru"]);
    vi.stubEnv("VERCEL_URL", "preview.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.snowdex.ru/");
    expect(getConfiguredSiteHosts()).toEqual(["edge-fit.vercel.app", "preview.vercel.app", "snowdex.ru"]);
    for (const host of ["edge-fit.vercel.app", "snowdex.ru"]) {
      expect(buildFirstTouchAcquisitionContext({
        pathname: "/quiz", search: "", referrer: `https://${host}/catalog`,
        selfReferralHosts: getConfiguredSiteHosts(),
      }).classification).toBe("self_referral");
    }
  });
});
