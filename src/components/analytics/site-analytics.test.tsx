import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => <span data-tracker="vercel-analytics" />,
}));
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => <span data-tracker="speed-insights" />,
}));
vi.mock("@/components/analytics/yandex-metrika", () => ({
  YandexMetrika: () => <span data-tracker="yandex-metrika" />,
}));

import { SiteAnalytics } from "@/components/analytics/site-analytics";

describe("SiteAnalytics private saved-result boundary", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_HOSTING_PROVIDER", "vercel");
    mocks.pathname = "/";
  });

  it("emits no trackers or no-JS pixel during Timeweb SSR", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTING_PROVIDER", "timeweb");
    expect(renderToStaticMarkup(<SiteAnalytics yandexMetrikaId={108458449} />)).toBe("");
  });

  it("does not mount any global tracker on a bearer result path", () => {
    mocks.pathname = `/result/${"a".repeat(43)}`;
    expect(renderToStaticMarkup(<SiteAnalytics yandexMetrikaId={123} />)).toBe(
      "",
    );
  });

  it("keeps all configured trackers on the normal result route", () => {
    mocks.pathname = "/result";
    const markup = renderToStaticMarkup(
      <SiteAnalytics yandexMetrikaId={123} />,
    );
    expect(markup).toContain("yandex-metrika");
    expect(markup).toContain("vercel-analytics");
    expect(markup).toContain("speed-insights");
  });

  it("can omit provider-only telemetry without removing Metrika", () => {
    const markup = renderToStaticMarkup(
      <SiteAnalytics yandexMetrikaId={123} enableVercelTelemetry={false} />,
    );
    expect(markup).toContain("yandex-metrika");
    expect(markup).not.toContain("vercel-analytics");
    expect(markup).not.toContain("speed-insights");
  });
});
