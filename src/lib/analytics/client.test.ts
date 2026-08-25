import { afterEach, describe, expect, it, vi } from "vitest";
import { ACQUISITION_STORAGE_KEY } from "@/lib/analytics/acquisition-context";
import {
  buildAnalyticsRequestBody,
  trackEvent,
} from "@/lib/analytics/client";

function installBrowser(url: string, referrer = "") {
  const values = new Map<string, string>();
  const location = new URL(url);
  const ym = vi.fn();
  const windowValue = {
    location,
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    crypto: { randomUUID: () => "session-1" },
    ym,
  };
  vi.stubGlobal("window", windowValue);
  vi.stubGlobal("document", { referrer, cookie: "" });
  vi.stubGlobal("navigator", {});
  return { values, windowValue, ym };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;
});

describe("analytics client acquisition enrichment", () => {
  it("keeps first touch, strips query from pagePath, and lets business fields win", () => {
    const { values, windowValue } = installBrowser(
      "https://edge-fit.vercel.app/?utm_source=yandex&utm_campaign=edgefit_023a&yclid=secret",
    );

    const first = JSON.parse(
      buildAnalyticsRequestBody("home_viewed"),
    ) as Record<string, unknown>;
    windowValue.location = new URL(
      "https://edge-fit.vercel.app/quiz?utm_source=telegram",
    );
    const second = JSON.parse(
      buildAnalyticsRequestBody("quiz_started", {
        quiz_version: "v1",
        acquisition_campaign: "business_override",
      }),
    ) as { pagePath: string; payload: Record<string, unknown> };

    expect(first.pagePath).toBe("/");
    expect(JSON.stringify(first)).not.toContain("yclid");
    expect(second.pagePath).toBe("/quiz");
    expect(second.payload).toMatchObject({
      quiz_version: "v1",
      acquisition_source: "yandex",
      acquisition_campaign: "business_override",
      acquisition_landing_path: "/",
    });
    expect(values.has(ACQUISITION_STORAGE_KEY)).toBe(true);
  });

  it("enriches only the internal request and preserves Yandex goal params", async () => {
    const { ym } = installBrowser(
      "https://edge-fit.vercel.app/?utm_source=yandex&utm_campaign=edgefit_023a",
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID = "123";

    await trackEvent("quiz_started", { quiz_version: "v1" });

    expect(ym).toHaveBeenCalledOnce();
    expect(ym).toHaveBeenCalledWith(
      123,
      "reachGoal",
      "edgefit_quiz_started",
      { quiz_version: "v1" },
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const internal = JSON.parse(String(request.body)) as {
      payload: Record<string, unknown>;
    };
    expect(internal.payload).toMatchObject({
      quiz_version: "v1",
      acquisition_source: "yandex",
      acquisition_campaign: "edgefit_023a",
    });
  });

  it("keeps analytics fail-open when persistence rejects", async () => {
    installBrowser("https://edge-fit.vercel.app/quiz");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(trackEvent("quiz_started")).resolves.toBeUndefined();
  });
});
