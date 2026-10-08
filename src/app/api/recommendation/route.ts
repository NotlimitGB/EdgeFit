import { publicApiError } from "@/lib/public-api-error";
import { randomUUID } from "node:crypto";
import { withDbDiagnosticContext, withDbDiagnosticStage } from "@/lib/database/lifecycle-diagnostics";
import { NextResponse } from "next/server";
import { сохранитьРезультатКвиза } from "@/lib/quiz-results";
import { getRecommendationCatalog } from "@/lib/products";
import {
  getFocusedBoardCheck,
  getRecommendation,
} from "@/lib/recommendation/engine";
import { recommendationRequestSchema } from "@/lib/quiz/schema";
import { SAVED_RESULT_TOKEN_HEADER } from "@/lib/saved-result-contract";
import { resolveCanonicalBoardRouteBySlug } from "@/lib/canonical-catalog";
import { OperationDeadlineError, withOperationDeadline } from "@/lib/operation-deadline";

export async function POST(request: Request) {
  const controller = new AbortController();
  try {
    return await withOperationDeadline(() => withDbDiagnosticContext(
      { scope: "recommendation", stage: "request", traceId: randomUUID() },
      () => handlePost(request, controller.signal)), 20_000, () => controller.abort());
  } catch (error) {
    if (error instanceof OperationDeadlineError) {
      console.error(JSON.stringify({ event: "public_api_failure", endpoint: "recommendation", category: "operation_deadline" }));
      return NextResponse.json({ message: "Подбор занял слишком много времени. Попробуй ещё раз немного позже." }, { status: 503 });
    }
    return publicApiError("recommendation", error, false, "Проверь параметры райдера и попробуй снова.");
  }
}

async function handlePost(request: Request, signal: AbortSignal) {
  let parsingInput = true;
  try {
    const { riderInput, purchasePreferences, focusedBoardSlug } =
      recommendationRequestSchema.parse(await request.json());
    signal.throwIfAborted();
    parsingInput = false;
    const focusedBoardResolution = focusedBoardSlug
      ? await withDbDiagnosticStage("focused_board_lookup", () => resolveCanonicalBoardRouteBySlug(focusedBoardSlug))
      : undefined;
    signal.throwIfAborted();

    if (focusedBoardSlug && !focusedBoardResolution) {
      return NextResponse.json(
        {
          message:
            "Выбранная модель не найдена. Вернись к карточке доски и попробуй снова.",
        },
        { status: 400 },
      );
    }
    const { products, familyKeyByProductId } =
      await withDbDiagnosticStage("catalog_loading", () => getRecommendationCatalog());
    signal.throwIfAborted();

    if (products.length === 0) {
      return NextResponse.json(
        {
          message: "Не удалось загрузить каталог. Попробуй ещё раз немного позже.",
        },
        { status: 503 },
      );
    }

    const recommendation = getRecommendation(riderInput, products, {
      familyKeyByProductId,
    });
    const responseRecommendation = focusedBoardResolution
      ? {
          ...recommendation,
          focusedBoardCheck: getFocusedBoardCheck(
            recommendation,
            focusedBoardResolution.item,
            { familyKeyByProductId },
          ),
        }
      : recommendation;

    signal.throwIfAborted();
    // The recommendation is already complete. Optional persistence must not turn
    // a useful result into a failure; expose a token only after acknowledgement.
    let savedResultToken: string | null = null;
    try {
      savedResultToken = await withOperationDeadline(() => withDbDiagnosticStage("result_persistence", () => сохранитьРезультатКвиза({
      вход: riderInput,
      результат: responseRecommendation,
      purchasePreferences,
      идентификаторСессии: request.headers.get("x-edgefit-session-id"),
      })), 2_000);
    } catch {
      console.error(JSON.stringify({ event: "public_api_failure", endpoint: "recommendation", category: "result_persistence_unavailable" }));
    }
    signal.throwIfAborted();

    const response = NextResponse.json(responseRecommendation);

    if (savedResultToken) {
      response.headers.set(SAVED_RESULT_TOKEN_HEADER, savedResultToken);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
    }

    return response;
  } catch (error) {
    if (error instanceof OperationDeadlineError) {
      return NextResponse.json({ message: "Сервис временно недоступен. Попробуй ещё раз немного позже." }, { status: 503 });
    }
    return publicApiError("recommendation", error, parsingInput, "Проверь параметры райдера и попробуй снова.");
  }
}
