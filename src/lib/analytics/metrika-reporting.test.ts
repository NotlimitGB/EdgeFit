import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getMetrikaReporting,
  METRIKA_MAX_CONCURRENCY,
  requestMetrikaData,
} from "@/lib/analytics/metrika-reporting";
import {
  buildReportWindows,
  getAnalyticsReportPrivacyViolations,
  reportWindowKeys,
} from "@/lib/analytics/reporting-core";

const windows = buildReportWindows(new Date("2026-08-09T12:00:00Z")).windows;

function okTrafficResponse() {
  return new Response(
    JSON.stringify({
      totals: [120, 180, 25, 2.5, 90],
      sampled: false,
      sample_share: 1,
      sample_size: 180,
      sample_space: 180,
      data_lag: 30,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function acquisitionMetrics({
  visits = 180,
  users = 120,
  quizVisitRate = 26.53061224,
}: {
  visits?: number;
  users?: number;
  quizVisitRate?: number;
} = {}) {
  return [
    visits,
    users,
    6,
    13,
    quizVisitRate,
    16.66666667,
    4,
    12,
    24.48979592,
    11.11111111,
    4,
    8,
    16.32653061,
    11.11111111,
  ];
}

function okAcquisitionResponse(metrics = acquisitionMetrics()) {
  return new Response(
    JSON.stringify({
      totals: metrics,
      sampled: false,
      sample_share: 1,
      sample_size: 180,
      sample_space: 180,
      data_lag: 0,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function okSourceResponse(
  dimensions: Array<{ id?: string; name?: string }> = [
    { id: "organic", name: "Поиск" },
    { id: "direct" },
  ],
) {
  return new Response(
    JSON.stringify({
      totals: acquisitionMetrics(),
      data: dimensions.map((dimension, index) => ({
        dimensions: [dimension],
        metrics: acquisitionMetrics({
          visits: index === 0 ? 120 : 30,
          users: index === 0 ? 80 : 25,
        }),
      })),
      sampled: true,
      sample_share: 0.5,
      sample_size: 500,
      sample_space: 1_000,
      data_lag: 60,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function okLandingResponse(
  paths: Array<{ id?: string; name?: string }> = [
    { name: "/" },
    { name: "/boards/yes-basic" },
  ],
) {
  return new Response(
    JSON.stringify({
      data: paths.map((dimension, index) => ({
        dimensions: [dimension],
        metrics: acquisitionMetrics({ visits: 20 - index, users: 15 - index }),
      })),
      sampled: false,
      sample_share: 1,
      sample_size: 49,
      sample_space: 49,
      data_lag: 0,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function okReferralResponse() {
  return new Response(
    JSON.stringify({
      data: [
        {
          dimensions: [{ id: "https://partner.example/path?token=redacted" }],
          metrics: acquisitionMetrics({ visits: 12, users: 2 }),
        },
        {
          dimensions: [{ id: "www.partner.example" }],
          metrics: acquisitionMetrics({ visits: 4, users: 1 }),
        },
        {
          dimensions: [{ name: "www.edge-fit.vercel.app" }],
          metrics: acquisitionMetrics({ visits: 5, users: 3 }),
        },
        {
          dimensions: [{ id: "not a domain" }],
          metrics: acquisitionMetrics({ visits: 1, users: 1 }),
        },
      ],
      sampled: false,
      sample_share: 1,
      sample_size: 22,
      sample_space: 22,
      data_lag: 0,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function responseForMetrikaRequest(input: URL | RequestInfo) {
  const url = new URL(String(input));
  const dimension = url.searchParams.get("dimensions");
  if (dimension === "ym:s:lastsignTrafficSource") {
    return okSourceResponse();
  }
  if (dimension === "ym:s:startURLPath") {
    return okLandingResponse();
  }
  if (dimension === "ym:s:lastsignReferalSource") {
    return okReferralResponse();
  }
  return url.searchParams.get("metrics")?.split(",").length === 14
    ? okAcquisitionResponse()
    : okTrafficResponse();
}

describe("Metrika reporting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns not_configured without counter and token", async () => {
    const fetchMock = vi.fn();
    const result = await getMetrikaReporting({
      counterIdValue: "",
      tokenValue: "",
      windows,
      fetchImpl: fetchMock,
    });
    expect(result.sourceStatus.status).toBe("not_configured");
    expect(result.acquisition.sourceStatus.status).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses nine bounded requests and only the three approved goal IDs", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      void init;
      return responseForMetrikaRequest(input);
    });
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
      sleepImpl: vi.fn(async () => undefined),
    });
    expect(result.sourceStatus.status).toBe("ok");
    expect(result.acquisition.sourceStatus.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(9);

    const calls = fetchMock.mock.calls.map(([input, init]) => ({
      url: new URL(String(input)),
      init,
    }));
    const sourceCall = calls.find(
      ({ url }) => url.searchParams.get("dimensions") === "ym:s:lastsignTrafficSource",
    );
    const landingCall = calls.find(
      ({ url }) => url.searchParams.get("dimensions") === "ym:s:startURLPath",
    );
    const referralCall = calls.find(
      ({ url }) => url.searchParams.get("dimensions") === "ym:s:lastsignReferalSource",
    );
    expect(sourceCall?.url.searchParams.get("limit")).toBe("20");
    expect(landingCall?.url.searchParams.get("limit")).toBe("10");
    expect(referralCall?.url.searchParams.get("filters")).toBe(
      "ym:s:lastsignTrafficSource=='referral'",
    );
    expect(sourceCall?.url.searchParams.get("sort")).toBe("-ym:s:visits");
    expect(calls[0]?.url.origin + calls[0]?.url.pathname).toBe(
      "https://api-metrika.yandex.net/stat/v1/data",
    );
    expect(calls[0]?.url.searchParams.get("timezone")).toBe("+03:00");
    expect(calls[0]?.url.searchParams.get("accuracy")).toBe("full");
    expect(calls[0]?.init?.headers).toEqual({ Authorization: "OAuth fake-token" });

    const metricLists = calls.map(({ url }) =>
      (url.searchParams.get("metrics") ?? "").split(",").filter(Boolean),
    );
    expect(Math.max(...metricLists.map((metrics) => metrics.length))).toBe(14);
    const acquisitionMetricsUsed = metricLists.filter((metrics) => metrics.length === 14);
    expect(acquisitionMetricsUsed).toHaveLength(4);
    for (const metrics of acquisitionMetricsUsed) {
      const joined = metrics.join(",");
      expect(joined).toContain("goal545241547");
      expect(joined).toContain("goal545241580");
      expect(joined).toContain("goal545241604");
      expect(joined).not.toContain("545241567");
      expect(joined).not.toContain("anyGoal");
      expect(joined).not.toContain("favoriteGoal");
      expect(joined).not.toContain("545666424");
      expect(joined).not.toContain("585637139");
      expect(joined).not.toContain("585637140");
    }
  });

  it("executes all report requests sequentially in deterministic order", async () => {
    let currentConcurrentRequests = 0;
    let maxConcurrentRequests = 0;
    const requestOrder: string[] = [];
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      currentConcurrentRequests += 1;
      maxConcurrentRequests = Math.max(
        maxConcurrentRequests,
        currentConcurrentRequests,
      );

      const url = new URL(String(input));
      const dimension = url.searchParams.get("dimensions");
      if (dimension === "ym:s:lastsignTrafficSource") {
        requestOrder.push("sources30Days");
      } else if (dimension === "ym:s:startURLPath") {
        requestOrder.push("landingPages30Days");
      } else if (dimension === "ym:s:lastsignReferalSource") {
        requestOrder.push("referralBreakdown");
      } else if (url.searchParams.get("metrics")?.split(",").length === 14) {
        requestOrder.push("acquisition7Days");
      } else {
        const key = reportWindowKeys.find((candidate) => {
          const window = windows[candidate];
          return (
            url.searchParams.get("date1") === window.startDate &&
            url.searchParams.get("date2") === window.endDate
          );
        });
        requestOrder.push(`traffic:${key ?? "unknown"}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1));
      currentConcurrentRequests -= 1;
      return responseForMetrikaRequest(input);
    });

    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
      sleepImpl: vi.fn(async () => undefined),
    });

    expect(METRIKA_MAX_CONCURRENCY).toBe(1);
    expect(maxConcurrentRequests).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(requestOrder).toEqual([
      ...reportWindowKeys.map((key) => `traffic:${key}`),
      "sources30Days",
      "acquisition7Days",
      "landingPages30Days",
      "referralBreakdown",
    ]);
    expect(result.sourceStatus.status).toBe("ok");
    expect(result.acquisition.sourceStatus.status).toBe("ok");
  });

  it("normalizes goal percentages, clamps rates, and retains sampling", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (
        !url.searchParams.has("dimensions") &&
        url.searchParams.get("metrics")?.split(",").length === 14
      ) {
        return okAcquisitionResponse(acquisitionMetrics({ quizVisitRate: 140 }));
      }
      return responseForMetrikaRequest(input);
    });
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
    });
    expect(result.traffic.last30Days?.bounceRate).toBe(0.25);
    expect(result.traffic.sourcesSampling).toMatchObject({
      status: "sampled",
      sampleShare: 0.5,
      sampleSize: 500,
      sampleSpace: 1_000,
    });
    expect(result.acquisition.last7Days?.goals.quizStarted).toMatchObject({
      users: 6,
      visits: 13,
      visitConversionRate: 1,
    });
    expect(
      result.acquisition.last7Days?.goals.quizStarted.userConversionRate,
    ).toBeCloseTo(0.1666666667);
    expect(result.acquisition.last30Days?.goals.productClicked.visitConversionRate).toBeCloseTo(
      0.1632653061,
    );
    expect(result.acquisition.last30Days?.sampling.status).toBe("sampled");
  });

  it("parses source conversions and accepts only privacy-safe landing paths", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.searchParams.get("dimensions") === "ym:s:startURLPath") {
        return okLandingResponse([
          { name: "/catalog" },
          { name: "https://example.com/private" },
          { name: "/quiz?draft=1" },
          { name: "/result#fit" },
          { id: "/boards/yes-basic" },
        ]);
      }
      return responseForMetrikaRequest(input);
    });
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
    });
    expect(result.traffic.sources30Days[0]).toMatchObject({
      source: "organic",
      label: "Поиск",
      visits: 120,
      users: 80,
      share: 0.8,
    });
    expect(result.acquisition.sources30Days[0]).toMatchObject({
      source: "organic",
      label: "Поиск",
    });
    expect(result.acquisition.sources30Days[1]).toMatchObject({
      source: "direct",
      label: "direct",
      goals: { quizStarted: { visits: 13 } },
    });
    expect(result.acquisition.landingPages30Days.map(({ path }) => path)).toEqual([
      "/catalog",
      "/boards/yes-basic",
    ]);
    expect(getAnalyticsReportPrivacyViolations({ acquisition: result.acquisition })).toEqual(
      [],
    );
  });

  it("reports privacy-safe referral domains with explicit self-referral classification", async () => {
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: vi.fn(async (input: URL | RequestInfo) =>
        responseForMetrikaRequest(input),
      ),
      selfReferralHosts: ["edge-fit.vercel.app"],
    });

    expect(result.acquisition.referralBreakdownStatus).toEqual({ status: "ok" });
    expect(result.acquisition.referralBreakdown).toEqual([
      expect.objectContaining({
        domain: "partner.example",
        classification: "external_referral",
        users: 3,
        visits: 16,
      }),
      expect.objectContaining({
        domain: "edge-fit.vercel.app",
        classification: "self_referral",
        users: 3,
        visits: 5,
      }),
      expect.objectContaining({
        domain: null,
        classification: "unknown_referral",
        users: 1,
        visits: 1,
      }),
    ]);
    expect(JSON.stringify(result.acquisition.referralBreakdown)).not.toContain("token");
    expect(result.acquisition.referralSampling.status).toBe("unsampled");
  });

  it("keeps acquisition data when only referral detail is unavailable", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.searchParams.get("dimensions") === "ym:s:lastsignReferalSource") {
        return new Response("down", { status: 503 });
      }
      return responseForMetrikaRequest(input);
    });
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
      sleepImpl: vi.fn(async () => undefined),
    });

    expect(result.sourceStatus.status).toBe("ok");
    expect(result.acquisition.sourceStatus.status).toBe("ok");
    expect(result.acquisition.sources30Days.length).toBeGreaterThan(0);
    expect(result.acquisition.referralBreakdown).toEqual([]);
    expect(result.acquisition.referralBreakdownStatus).toEqual({
      status: "unavailable",
      diagnostic: { category: "upstream", httpStatus: 503 },
    });
  });

  it("normalizes source-label mojibake consistently without changing source IDs", async () => {
    const malformedLabel = "РџРµСЂРµС…РѕРґС‹ РёР· РїРѕРёСЃРєРѕРІС‹С… СЃРёСЃС‚РµРј";
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.searchParams.get("dimensions") === "ym:s:lastsignTrafficSource") {
        return okSourceResponse([
          { id: "organic", name: malformedLabel },
          { id: "direct" },
          { id: "custom-source", name: "Партнёрская кампания" },
        ]);
      }
      return responseForMetrikaRequest(input);
    });

    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
    });

    expect(result.traffic.sources30Days).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "organic",
          label: "Переходы из поисковых систем",
        }),
        expect.objectContaining({ source: "direct", label: "direct" }),
        expect.objectContaining({
          source: "custom-source",
          label: "Партнёрская кампания",
        }),
      ]),
    );
    expect(result.acquisition.sources30Days).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "organic",
          label: "Переходы из поисковых систем",
        }),
        expect.objectContaining({ source: "direct", label: "direct" }),
        expect.objectContaining({
          source: "custom-source",
          label: "Партнёрская кампания",
        }),
      ]),
    );
    expect(result.traffic.sources30Days[0]?.label).not.toBe(malformedLabel);
    expect(result.acquisition.sources30Days[0]?.label).not.toBe(malformedLabel);
  });

  it("keeps basic traffic when an acquisition-only request fails", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.searchParams.get("dimensions") === "ym:s:startURLPath") {
        return new Response("down", { status: 503 });
      }
      return responseForMetrikaRequest(input);
    });
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
      sleepImpl: vi.fn(async () => undefined),
    });
    expect(result.sourceStatus.status).toBe("ok");
    expect(result.traffic.last30Days?.users).toBe(120);
    expect(result.acquisition.sourceStatus).toEqual({
      status: "unavailable",
      diagnostic: { category: "upstream", httpStatus: 503 },
    });
    expect(result.acquisition.last30Days).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  it("marks acquisition unavailable for malformed goal totals", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (
        !url.searchParams.has("dimensions") &&
        url.searchParams.get("metrics")?.split(",").length === 14
      ) {
        return okAcquisitionResponse([10, 8]);
      }
      return responseForMetrikaRequest(input);
    });
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
    });
    expect(result.sourceStatus.status).toBe("ok");
    expect(result.acquisition.sourceStatus).toEqual({
      status: "unavailable",
      diagnostic: { category: "invalid_response" },
    });
  });

  it("returns a successful response without retrying or sleeping", async () => {
    const fetchMock = vi.fn(async () => okTrafficResponse());
    const sleepMock = vi.fn(async () => undefined);
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      sleepImpl: sleepMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("respects Retry-After seconds for a 429 before succeeding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("later", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      )
      .mockResolvedValueOnce(okTrafficResponse());
    const sleepMock = vi.fn(async () => undefined);
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      sleepImpl: sleepMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledOnce();
    expect(sleepMock).toHaveBeenCalledWith(2_000);
    expect(result.ok).toBe(true);
  });

  it.each([undefined, "not-a-delay"])(
    "uses fallback backoff for a 429 with Retry-After %s",
    async (retryAfter) => {
      const headers = retryAfter ? { "Retry-After": retryAfter } : undefined;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("later", { status: 429, headers }))
        .mockResolvedValueOnce(okTrafficResponse());
      const sleepMock = vi.fn(async () => undefined);

      const result = await requestMetrikaData({
        url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
        token: "fake-token",
        fetchImpl: fetchMock,
        sleepImpl: sleepMock,
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleepMock).toHaveBeenCalledWith(500);
      expect(result.ok).toBe(true);
    },
  );

  it.each([
    { retryAfter: "999", now: Date.parse("2026-08-20T00:00:00Z") },
    {
      retryAfter: "Thu, 20 Aug 2026 00:01:00 GMT",
      now: Date.parse("2026-08-20T00:00:00Z"),
    },
  ])("clamps excessive Retry-After value $retryAfter", async ({ retryAfter, now }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("later", {
          status: 429,
          headers: { "Retry-After": retryAfter },
        }),
      )
      .mockResolvedValueOnce(okTrafficResponse());
    const sleepMock = vi.fn(async () => undefined);

    await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      sleepImpl: sleepMock,
      nowImpl: () => now,
    });

    expect(sleepMock).toHaveBeenCalledWith(10_000);
  });

  it("supports an HTTP-date Retry-After value", async () => {
    const now = Date.parse("2026-08-20T00:00:00Z");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("later", {
          status: 429,
          headers: { "Retry-After": "Thu, 20 Aug 2026 00:00:02 GMT" },
        }),
      )
      .mockResolvedValueOnce(okTrafficResponse());
    const sleepMock = vi.fn(async () => undefined);

    await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      sleepImpl: sleepMock,
      nowImpl: () => now,
    });

    expect(sleepMock).toHaveBeenCalledWith(2_000);
  });

  it("stops after exactly three rate-limited attempts", async () => {
    const fetchMock = vi.fn(async () => new Response("later", { status: 429 }));
    const sleepMock = vi.fn(async () => undefined);
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      sleepImpl: sleepMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepMock.mock.calls).toEqual([[500], [1_000]]);
    expect(result).toEqual({
      ok: false,
      diagnostic: { category: "rate_limited", httpStatus: 429 },
    });
  });

  it("retries a 5xx with fallback backoff before succeeding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(okTrafficResponse());
    const sleepMock = vi.fn(async () => undefined);
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      sleepImpl: sleepMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(500);
    expect(result.ok).toBe(true);
  });

  it("retries a timeout with a fresh AbortController", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn(
      async (_input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        const signal = init?.signal;
        if (!signal) {
          throw new Error("missing abort signal");
        }
        signals.push(signal);
        if (signals.length === 1) {
          return new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                const error = new Error("timed out");
                error.name = "AbortError";
                reject(error);
              },
              { once: true },
            );
          });
        }
        return okTrafficResponse();
      },
    );
    const sleepMock = vi.fn(async () => undefined);

    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      timeoutMs: 1,
      sleepImpl: sleepMock,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(500);
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("retries a network error before succeeding", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(okTrafficResponse());
    const sleepMock = vi.fn(async () => undefined);

    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      sleepImpl: sleepMock,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(500);
  });

  it.each([
    { status: 400, category: "upstream" },
    { status: 401, category: "authentication" },
    { status: 403, category: "authentication" },
  ])("does not retry HTTP $status", async ({ status, category }) => {
    const fetchMock = vi.fn(async () => new Response("denied", { status }));
    const sleepMock = vi.fn(async () => undefined);
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      sleepImpl: sleepMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      diagnostic: { category, httpStatus: status },
    });
  });

  it("returns invalid_response without retrying invalid JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("not-json", { status: 200 }));
    const sleepMock = vi.fn(async () => undefined);
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
      sleepImpl: sleepMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, diagnostic: { category: "invalid_response" } });
  });

  it("never leaks a token from a network error", async () => {
    const token = "super-secret-fake-token";
    const fetchMock = vi.fn(async () => {
      throw new Error(`request failed with ${token}`);
    });
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token,
      fetchImpl: fetchMock,
      timeoutMs: 10,
      sleepImpl: vi.fn(async () => undefined),
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result).toEqual({ ok: false, diagnostic: { category: "network" } });
  });
});
