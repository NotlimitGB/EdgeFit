import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const json = vi.fn((value: unknown) => value);
  const query = vi.fn(async (...parameters: unknown[]) => {
    void parameters;
    return [];
  });
  const sql = Object.assign(query, { json });

  const getClient = vi.fn(() => sql);

  return { getClient, json, query, sql };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/database/config", () => ({
  базаНастроена: () => true,
}));

vi.mock("@/lib/database/client", () => ({
  получитьКлиентБазы: () => mocks.getClient(),
}));

import { saveAnalyticsEvent } from "@/lib/analytics/server";

describe("saveAnalyticsEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["development", "https://edgefit-real-nonlocal.example/result"],
    ["test", "https://edgefit-real-nonlocal.example/result"],
    ["production", "http://localhost:3000/result"],
    ["production", "http://app.localhost:3000/result"],
    ["production", "http://127.0.0.1:3000/result"],
    ["production", "http://0.0.0.0:3000/result"],
    ["production", "http://[::1]:3000/result"],
    ["production", "not-a-valid-url"],
  ])(
    "skips persistence for NODE_ENV=%s and request %s",
    async (nodeEnv, requestUrl) => {
      vi.stubEnv("NODE_ENV", nodeEnv);

      await saveAnalyticsEvent({
        sessionId: "session-local",
        eventName: "result_viewed",
        requestUrl,
      });

      expect(mocks.getClient).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it("passes a structured payload through the Postgres JSONB parameter", async () => {
    const payload = {
      board_slug: "yes-basic",
      offer_slug: "yes-basic",
      placement: "result-top",
      nested: {
        enabled: true,
        count: 2,
      },
    };

    await saveAnalyticsEvent({
      sessionId: "session-1",
      eventName: "product_clicked",
      requestUrl: "https://edgefit-real-nonlocal.example/result",
      pagePath: "/result",
      payload,
    });

    expect(mocks.json).toHaveBeenCalledOnce();
    expect(mocks.json).toHaveBeenCalledWith(payload);
    expect(typeof mocks.json.mock.calls[0]?.[0]).not.toBe("string");

    const [, ...parameters] = mocks.query.mock.calls[0] ?? [];
    expect(parameters).toEqual([
      "session-1",
      "product_clicked",
      "/result",
      payload,
    ]);
  });

  it("persists an omitted payload as an empty structured object", async () => {
    await saveAnalyticsEvent({
      sessionId: "session-2",
      eventName: "home_viewed",
      requestUrl: "https://edgefit-real-nonlocal.example/",
    });

    expect(mocks.json).toHaveBeenCalledOnce();
    expect(mocks.json).toHaveBeenCalledWith({});
    expect(typeof mocks.json.mock.calls[0]?.[0]).not.toBe("string");

    const [, ...parameters] = mocks.query.mock.calls[0] ?? [];
    expect(parameters).toEqual(["session-2", "home_viewed", null, {}]);
  });
});
