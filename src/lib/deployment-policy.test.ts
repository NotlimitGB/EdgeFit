import { afterEach, describe, expect, it, vi } from "vitest";
import { getHostingProvider, isCanonicalProductionHost, isBrowserAnalyticsAllowed } from "./deployment-policy";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("deployment provider and exact production hosts", () => {
  it("preserves the Vercel default and rejects unknown providers", () => {
    expect(getHostingProvider("")).toBe("vercel");
    expect(getHostingProvider("vercel")).toBe("vercel");
    expect(getHostingProvider("timeweb")).toBe("timeweb");
    for (const value of ["unknown", "TIMEWEB", " timeweb "]) expect(() => getHostingProvider(value)).toThrow("NEXT_PUBLIC_HOSTING_PROVIDER");
  });
  it.each(["snowdex.ru", "www.snowdex.ru", "SNOWDEX.RU", "snowdex.ru:3000"])("accepts canonical Host %s", host => {
    expect(isCanonicalProductionHost(host)).toBe(true);
  });
  it.each([null, undefined, "", " snowdex.ru", "snowdex.ru.", "snowdex.ru:0", "snowdex.ru:65536", "snowdex.ru:invalid",
    "snowdex.ru.evil.test", "evil-snowdex.ru", "https://snowdex.ru", "snowdex.ru/path", "snowdex.ru,other.test",
    "notlimitgb-edgefit-0277.twc1.net", "localhost", "127.0.0.1", "edge-fit.vercel.app"])("rejects unknown/malformed Host %s", host => {
    expect(isCanonicalProductionHost(host)).toBe(false);
  });
  it("denies Timeweb browser analytics on SSR and technical hosts", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTING_PROVIDER", "timeweb");
    expect(isBrowserAnalyticsAllowed()).toBe(false);
    vi.stubGlobal("window", { location: new URL("https://notlimitgb-edgefit-0277.twc1.net/") });
    expect(isBrowserAnalyticsAllowed()).toBe(false);
    vi.stubGlobal("window", { location: new URL("https://snowdex.ru/") });
    expect(isBrowserAnalyticsAllowed()).toBe(true);
  });
});
