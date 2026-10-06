// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isCanonicalProductionHost } from "@/lib/deployment-policy";

const mocks = vi.hoisted(() => ({ host: "snowdex.ru", pathname: "/", capture: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/deployment-policy", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/deployment-policy")>(),
  isBrowserAnalyticsAllowed: () => isCanonicalProductionHost(mocks.host),
}));
vi.mock("@/lib/analytics/acquisition-context", () => ({ captureCurrentFirstTouchAcquisitionContext: mocks.capture }));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => <span data-tracker="vercel" /> }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => <span data-tracker="speed" /> }));
vi.mock("@/components/analytics/yandex-metrika", () => ({ YandexMetrika: ({ counterId }: { counterId: number }) => <span data-tracker="metrika">{counterId}</span> }));
import { SiteAnalytics } from "./site-analytics";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); mocks.capture.mockClear(); mocks.pathname = "/"; });
describe("Timeweb tracker hydration gate", () => {
  it.each(["snowdex.ru", "www.snowdex.ru", "notlimitgb-edgefit-0277.twc1.net", "snowdex.ru.evil.test"])("hydrates safely on %s", async host => {
    vi.stubEnv("NEXT_PUBLIC_HOSTING_PROVIDER", "timeweb"); mocks.host = host;
    const container = document.createElement("div"); document.body.append(container);
    container.innerHTML = renderToString(<SiteAnalytics yandexMetrikaId={108458449} />);
    expect(container.innerHTML).toBe("");
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, <SiteAnalytics yandexMetrikaId={108458449} />); });
    const allowed = isCanonicalProductionHost(host);
    expect(container.textContent).toBe(allowed ? "108458449" : "");
    expect(mocks.capture).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(container.querySelector('[data-tracker="vercel"], [data-tracker="speed"], noscript')).toBeNull();
    await act(async () => root!.unmount()); container.remove();
  });
  it("preserves saved-result exclusion on the canonical host", () => {
    vi.stubEnv("NEXT_PUBLIC_HOSTING_PROVIDER", "timeweb"); mocks.host = "snowdex.ru";
    mocks.pathname = `/result/${"a".repeat(43)}`;
    const { container } = render(<SiteAnalytics yandexMetrikaId={108458449} />);
    expect(container.innerHTML).toBe(""); expect(mocks.capture).not.toHaveBeenCalled();
  });
});
