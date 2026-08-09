import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getMetrikaReporting,
  requestMetrikaData,
} from "@/lib/analytics/metrika-reporting";
import { buildReportWindows } from "@/lib/analytics/reporting-core";

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

function okSourceResponse() {
  return new Response(
    JSON.stringify({
      data: [
        {
          dimensions: [{ id: "organic", name: "Переходы из поисковых систем" }],
          metrics: [120, 80],
        },
        {
          dimensions: [{ id: "direct", name: "Прямые заходы" }],
          metrics: [30, 25],
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds exact aggregate and last-significant source requests", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return url.searchParams.has("dimensions")
        ? okSourceResponse()
        : okTrafficResponse();
    });
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
    });
    expect(result.sourceStatus.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const calls = fetchMock.mock.calls.map(([input, init]) => ({
      url: new URL(String(input)),
      init,
    }));
    const totalsCall = calls.find(({ url }) => !url.searchParams.has("dimensions"));
    const sourceCall = calls.find(({ url }) => url.searchParams.has("dimensions"));
    expect(totalsCall?.url.origin + totalsCall?.url.pathname).toBe(
      "https://api-metrika.yandex.net/stat/v1/data",
    );
    expect(totalsCall?.url.searchParams.get("timezone")).toBe("+03:00");
    expect(totalsCall?.url.searchParams.get("accuracy")).toBe("full");
    expect(totalsCall?.init?.headers).toEqual({ Authorization: "OAuth fake-token" });
    expect(sourceCall?.url.searchParams.get("dimensions")).toBe(
      "ym:s:lastsignTrafficSource",
    );
    expect(sourceCall?.url.searchParams.get("limit")).toBe("10");
  });

  it("normalizes bounce rate and preserves sampling metadata", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) =>
      new URL(String(input)).searchParams.has("dimensions")
        ? okSourceResponse()
        : okTrafficResponse(),
    );
    const result = await getMetrikaReporting({
      counterIdValue: "12345",
      tokenValue: "fake-token",
      windows,
      fetchImpl: fetchMock,
    });
    expect(result.traffic.last30Days?.bounceRate).toBe(0.25);
    expect(result.traffic.last30Days?.sampling.status).toBe("unsampled");
    expect(result.traffic.sourcesSampling).toMatchObject({
      status: "sampled",
      sampleShare: 0.5,
      sampleSize: 500,
      sampleSpace: 1_000,
    });
    expect(result.traffic.sources30Days[0]).toMatchObject({
      source: "organic",
      visits: 120,
      users: 80,
      share: 0.8,
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
