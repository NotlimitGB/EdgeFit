import type { RecommendationResult } from "@/types/domain";
import { SAVED_RESULT_TOKEN_HEADER } from "@/lib/saved-result-contract";
import {
  isQuizRequestId,
  QUIZ_REQUEST_ID_HEADER,
  reportQuizLifecycleEvent,
} from "@/lib/quiz-lifecycle-diagnostics";

// One budget covers headers AND the full body. Abort cannot guarantee that a
// server-side write has not completed; this helper never retries a POST.
export async function requestRecommendation(
  init: RequestInit,
  signal: AbortSignal,
  requestId?: string,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let stage: "response_headers" | "response_body" | "response" = "response_headers";
  let failureCategory:
    | "network_failure"
    | "body_read_failure"
    | "api_rejection"
    | "invalid_response"
    | undefined;
  const startedAt = performance.now();
  let rejectAbort: () => void = () => undefined;
  const stopped = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new Error("Подбор не завершился вовремя. Попробуй ещё раз немного позже."));
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
    timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, 30_000);
  });
  try {
    return await Promise.race([stopped, (async () => {
      let response: Response;
      const headers = new Headers(init.headers);
      if (isQuizRequestId(requestId)) {
        headers.set(QUIZ_REQUEST_ID_HEADER, requestId);
      }
      try {
        response = await fetch("/api/recommendation", { ...init, headers, signal: controller.signal });
      } catch {
        stage = "response_headers";
        failureCategory = "network_failure";
        throw new Error(
          "Не удалось отправить ответы. Проверь соединение и попробуй ещё раз.",
        );
      }
      stage = "response_body";
      const body = await response.json().catch(() => {
        failureCategory = "body_read_failure";
        throw new Error("Не удалось прочитать результат. Попробуй ещё раз немного позже.");
      });
      stage = "response";
      if (!response.ok) {
        failureCategory = "api_rejection";
        throw new Error(typeof body?.message === "string" ? body.message : "Не удалось получить рекомендацию. Попробуй ещё раз.");
      }
      if (!body || typeof body !== "object" || typeof body.algorithmVersion !== "string" ||
          !body.input || !body.lengthRange || !Array.isArray(body.recommendedBoards) || !Array.isArray(body.avoidBoards)) {
        failureCategory = "invalid_response";
        throw new Error("Сервис вернул неполный результат. Попробуй ещё раз немного позже.");
      }
      return { recommendation: body as RecommendationResult,
        savedToken: response.headers.get(SAVED_RESULT_TOKEN_HEADER) };
    })()]);
  } catch (error) {
    if (requestId && !signal.aborted) {
      reportQuizLifecycleEvent(
        requestId,
        stage,
        performance.now() - startedAt,
        timedOut ? "client_timeout" : failureCategory ?? "invalid_response",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
