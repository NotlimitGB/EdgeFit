import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveAnalyticsEvent: vi.fn(),
}));

vi.mock("@/lib/analytics/server", () => ({
  saveAnalyticsEvent: (...parameters: unknown[]) =>
    mocks.saveAnalyticsEvent(...parameters),
}));

import { POST } from "@/app/api/analytics/route";

describe("analytics API request context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sanitizes an unexpected persistence exception", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.saveAnalyticsEvent.mockRejectedValueOnce(new Error("audit-private-db-detail"));
    const response = await POST(new Request("http://localhost/api/analytics", {
      method: "POST", body: JSON.stringify({ sessionId: "session-1", eventName: "quiz_started" }),
    }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("audit-private-db-detail");
    log.mockRestore();
  });

  it("forwards the server request URL and preserves the public payload", async () => {
    const request = new Request("http://localhost:3000/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        eventName: "result_viewed",
        pagePath: "/result",
        payload: { result_variant: "session", isLocal: false },
        requestUrl: "https://forged.example/api/analytics",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(mocks.saveAnalyticsEvent).toHaveBeenCalledOnce();
    expect(mocks.saveAnalyticsEvent).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventName: "result_viewed",
      requestUrl: request.url,
      pagePath: "/result",
      payload: { result_variant: "session", isLocal: false },
    });
  });
});
