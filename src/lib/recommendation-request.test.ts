import { afterEach, expect, it, vi } from "vitest";
import { requestRecommendation } from "./recommendation-request";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["headers", "body"])("bounds stalled %s, aborts once and does not retry", async phase => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const requestId = "9f9cf976-b611-4ec7-81e1-106931a16313";
  const fetcher = vi.fn((_url, init) => { signal = init.signal;
    return phase === "headers" ? new Promise(() => undefined) : Promise.resolve({ ok: true, json: () => new Promise(() => undefined) }); });
  vi.stubGlobal("fetch", fetcher);
  const pending = requestRecommendation({ method: "POST" }, new AbortController().signal, requestId).catch(e => e);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(30_000);
  expect((await pending).message).toContain("не завершился вовремя");
  expect(signal?.aborted).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  const headers = new Headers(fetcher.mock.calls[0][1].headers);
  expect(headers.get("x-snowdex-request-id")).toBe(requestId);
  const event = JSON.parse(String(info.mock.calls[0][0]));
  expect(event).toMatchObject({ requestId, stage: phase === "headers" ? "response_headers" : "response_body", category: "client_timeout" });
});
it("does not apply a late response after the client budget expires", async () => {
  vi.useFakeTimers();
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const requestId = "9f9cf976-b611-4ec7-81e1-106931a16313";
  const data = { algorithmVersion: "v1.6.4", input: {}, lengthRange: { min: 152, max: 156 }, recommendedBoards: [], avoidBoards: [] };
  let resolveFetch!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const pending = requestRecommendation({}, new AbortController().signal, requestId).catch((error: Error) => error);

  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(30_000);
  expect((await pending).message).toContain("не завершился вовремя");
  resolveFetch(new Response(JSON.stringify(data)));
  await Promise.resolve();
  await Promise.resolve();

  expect(fetcher).toHaveBeenCalledOnce();
  expect(info.mock.calls).toHaveLength(1);
  expect(JSON.parse(String(info.mock.calls[0][0]))).toMatchObject({
    requestId,
    category: "client_timeout",
  });
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

it("replaces raw network errors with a recoverable Russian message", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const requestId = "9f9cf976-b611-4ec7-81e1-106931a16313";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch: private-network-detail");
    }),
  );

  const error = await requestRecommendation(
    {},
    new AbortController().signal,
    requestId,
  ).catch((reason: Error) => reason);

  expect(error.message).toBe(
    "Не удалось отправить ответы. Проверь соединение и попробуй ещё раз.",
  );
  expect(error.message).not.toContain("private-network-detail");
  expect(String(info.mock.calls[0][0])).toContain('"requestId":"9f9cf976-b611-4ec7-81e1-106931a16313"');
  expect(String(info.mock.calls[0][0])).toContain('"category":"network_failure"');
  expect(String(info.mock.calls[0][0])).not.toContain("private-network-detail");
});

it("adds the diagnostic ID without replacing existing request headers", async () => {
  const requestId = "9f9cf976-b611-4ec7-81e1-106931a16313";
  const data = { algorithmVersion: "v1.6.4", input: {}, lengthRange: { min: 152, max: 156 }, recommendedBoards: [], avoidBoards: [] };
  const fetcher = vi.fn(async () => new Response(JSON.stringify(data)));
  vi.stubGlobal("fetch", fetcher);

  await requestRecommendation({
    method: "POST",
    headers: { "Content-Type": "application/json", "x-existing-contract": "kept" },
  }, new AbortController().signal, requestId);

  const headers = new Headers(fetcher.mock.calls[0][1].headers);
  expect(headers.get("content-type")).toBe("application/json");
  expect(headers.get("x-existing-contract")).toBe("kept");
  expect(headers.get("x-snowdex-request-id")).toBe(requestId);
});

it("records a safe API failure category without logging response text", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const requestId = "9f9cf976-b611-4ec7-81e1-106931a16313";
  const privateDetail = "sentinel-private-response-detail";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ message: "Сервис временно недоступен.", privateDetail }),
    { status: 503 },
  )));

  await expect(requestRecommendation(
    {},
    new AbortController().signal,
    requestId,
  )).rejects.toThrow("Сервис временно недоступен.");

  expect(JSON.parse(String(info.mock.calls[0][0]))).toMatchObject({
    requestId,
    stage: "response",
    category: "api_rejection",
  });
  expect(String(info.mock.calls[0][0])).not.toContain(privateDetail);
});
