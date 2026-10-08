import { afterEach, expect, it, vi } from "vitest";
import { requestRecommendation } from "./recommendation-request";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(["headers", "body"])("bounds stalled %s, aborts once and does not retry", async phase => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const fetcher = vi.fn((_url, init) => { signal = init.signal;
    return phase === "headers" ? new Promise(() => undefined) : Promise.resolve({ ok: true, json: () => new Promise(() => undefined) }); });
  vi.stubGlobal("fetch", fetcher);
  const pending = requestRecommendation({ method: "POST" }, new AbortController().signal).catch(e => e);
  await vi.advanceTimersByTimeAsync(30_000);
  expect((await pending).message).toContain("не завершился вовремя");
  expect(signal?.aborted).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
it("preserves a successful full response and token", async () => {
  const data = { algorithmVersion: "v1.6.4", input: {}, lengthRange: { min: 152, max: 156 }, recommendedBoards: [], avoidBoards: [] };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(data), { headers: { "x-edgefit-saved-result-token": "token" } })));
  expect((await requestRecommendation({ method: "POST" }, new AbortController().signal)).recommendation).toEqual(data);
});
it.each(["not-json", "null", "{}"])("rejects malformed/incomplete responses (%s)", async body => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  await expect(requestRecommendation({}, new AbortController().signal)).rejects.toThrow(/результат/);
});
it("abandons unmounted and late work without an unhandled rejection", async () => {
  let rejectLate!: (e: Error) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((_, reject) => { rejectLate = reject; })));
  const controller = new AbortController(); const pending = requestRecommendation({}, controller.signal).catch(e => e);
  controller.abort(); expect((await pending).message).toContain("не завершился вовремя");
  rejectLate(new Error("late")); await Promise.resolve();
});
it.each([400, 503])("preserves safe server errors (%s)", async status => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Попробуй снова" }), { status })));
  await expect(requestRecommendation({}, new AbortController().signal)).rejects.toThrow("Попробуй снова");
});
