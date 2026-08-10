import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getMetrikaReporting,
  requestMetrikaData,
} from "@/lib/analytics/metrika-reporting";
import {
  buildReportWindows,
  getAnalyticsReportPrivacyViolations,
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

function okSourceResponse() {
  return new Response(
    JSON.stringify({
      totals: acquisitionMetrics(),
      data: [
        {
          dimensions: [{ id: "organic", name: "Поиск" }],
          metrics: acquisitionMetrics({ visits: 120, users: 80 }),
        },
        {
          dimensions: [{ id: "direct" }],
          metrics: acquisitionMetrics({ visits: 30, users: 25 }),
        },
      ],
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

function responseForMetrikaRequest(input: URL | RequestInfo) {
  const url = new URL(String(input));
  const dimension = url.searchParams.get("dimensions");
  if (dimension === "ym:s:lastsignTrafficSource") {
    return okSourceResponse();
  }
  if (dimension === "ym:s:startURLPath") {
    return okLandingResponse();
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

  it("uses eight bounded requests and only the three approved goal IDs", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) =>
      responseForMetrikaRequest(input),
    );
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
    });
    expect(result.sourceStatus.status).toBe("ok");
    expect(result.acquisition.sourceStatus.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(8);

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
    expect(sourceCall?.url.searchParams.get("limit")).toBe("20");
    expect(landingCall?.url.searchParams.get("limit")).toBe("10");
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
    expect(acquisitionMetricsUsed).toHaveLength(3);
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
      visits: 120,
      users: 80,
      share: 0.8,
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
    });
    expect(result.sourceStatus.status).toBe("ok");
    expect(result.traffic.last30Days?.users).toBe(120);
    expect(result.acquisition.sourceStatus).toEqual({
      status: "unavailable",
      diagnostic: { category: "upstream", httpStatus: 503 },
    });
    expect(result.acquisition.last30Days).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(9);
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

  it("does not retry authentication failures", async () => {
    const fetchMock = vi.fn(async () => new Response("denied", { status: 401 }));
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      diagnostic: { category: "authentication", httpStatus: 401 },
    });
  });

  it("retries a rate limit only once", async () => {
    const fetchMock = vi.fn(async () => new Response("later", { status: 429 }));
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: false,
      diagnostic: { category: "rate_limited", httpStatus: 429 },
    });
  });

  it("retries a 5xx only once", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns invalid_response without retrying invalid JSON", async () => {
    const fetchMock = vi.fn(async () => new Response("not-json", { status: 200 }));
    const result = await requestMetrikaData({
      url: new URL("https://api-metrika.yandex.net/stat/v1/data"),
      token: "fake-token",
      fetchImpl: fetchMock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result).toEqual({ ok: false, diagnostic: { category: "network" } });
  });
});
