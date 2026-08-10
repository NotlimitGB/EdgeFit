import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const json = vi.fn((value: unknown) => value);
  const query = vi.fn(async (...parameters: unknown[]) => {
    void parameters;
    return [];
  });
  const sql = Object.assign(query, { json });

  return { json, query, sql };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/database/config", () => ({
  базаНастроена: () => true,
}));

vi.mock("@/lib/database/client", () => ({
  получитьКлиентБазы: () => mocks.sql,
}));

import { saveAnalyticsEvent } from "@/lib/analytics/server";

describe("saveAnalyticsEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    });

    expect(mocks.json).toHaveBeenCalledOnce();
    expect(mocks.json).toHaveBeenCalledWith({});
    expect(typeof mocks.json.mock.calls[0]?.[0]).not.toBe("string");

    const [, ...parameters] = mocks.query.mock.calls[0] ?? [];
    expect(parameters).toEqual(["session-2", "home_viewed", null, {}]);
  });
});
