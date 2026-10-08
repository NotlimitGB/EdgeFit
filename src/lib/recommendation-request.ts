import type { RecommendationResult } from "@/types/domain";
import { SAVED_RESULT_TOKEN_HEADER } from "@/lib/saved-result-contract";

// One budget covers headers AND the full body. Abort cannot guarantee that a
// server-side write has not completed; this helper never retries a POST.
export async function requestRecommendation(init: RequestInit, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: () => void = () => undefined;
  const stopped = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new Error("Подбор не завершился вовремя. Попробуй ещё раз немного позже."));
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
    timer = setTimeout(abort, 30_000);
  });
  try {
    return await Promise.race([stopped, (async () => {
      const response = await fetch("/api/recommendation", { ...init, signal: controller.signal });
      const body = await response.json().catch(() => {
        throw new Error("Не удалось прочитать результат. Попробуй ещё раз немного позже.");
      });
      if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "Не удалось получить рекомендацию. Попробуй ещё раз.");
      if (!body || typeof body !== "object" || typeof body.algorithmVersion !== "string" ||
          !body.input || !body.lengthRange || !Array.isArray(body.recommendedBoards) || !Array.isArray(body.avoidBoards)) {
        throw new Error("Сервис вернул неполный результат. Попробуй ещё раз немного позже.");
      }
      return { recommendation: body as RecommendationResult,
        savedToken: response.headers.get(SAVED_RESULT_TOKEN_HEADER) };
    })()]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
