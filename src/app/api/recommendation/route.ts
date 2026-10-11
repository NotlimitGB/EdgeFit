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
import { OperationDeadlineError } from "@/lib/operation-deadline";
import { runPublicDbWork } from "@/lib/database/public-work";
import { PublicDbUnavailableError } from "@/lib/database/operation-boundary";
import {
  isQuizRequestId,
  QUIZ_REQUEST_ID_HEADER,
  reportQuizLifecycleEvent,
} from "@/lib/quiz-lifecycle-diagnostics";

export async function POST(request: Request) {
  const suppliedRequestId = request.headers.get(QUIZ_REQUEST_ID_HEADER);
  const requestId = isQuizRequestId(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID();
  const startedAt = performance.now();
  reportQuizLifecycleEvent(requestId, "request", 0, "started");
  try {
    const response = await withDbDiagnosticContext(
      { scope: "recommendation", stage: "request", traceId: requestId },
      () => runPublicDbWork("critical", 20_000, signal => handlePost(request, signal, requestId)));
    reportQuizLifecycleEvent(
      requestId,
      "response",
      performance.now() - startedAt,
      response.status < 400
        ? "success"
        : response.status === 400
          ? "request_rejected"
          : "service_unavailable",
    );
    return response;
  } catch (error) {
    if (error instanceof OperationDeadlineError || error instanceof PublicDbUnavailableError) {
      const category = error instanceof OperationDeadlineError
        ? "operation_deadline"
        : error.code === "PUBLIC_DB_SATURATED"
          ? "admission_saturation"
          : "database_unavailable";
      reportQuizLifecycleEvent(
        requestId,
        "request",
        performance.now() - startedAt,
        category,
      );
      console.error(JSON.stringify({ event: "public_api_failure", endpoint: "recommendation", category }));
      return NextResponse.json({ message: "Подбор занял слишком много времени. Попробуй ещё раз немного позже." }, { status: 503 });
    }
    reportQuizLifecycleEvent(
      requestId,
      "request",
      performance.now() - startedAt,
      "server_error",
    );
    return publicApiError("recommendation", error, false, "Проверь параметры райдера и попробуй снова.");
  }
}

async function handlePost(request: Request, signal: AbortSignal, requestId: string) {
  let parsingInput = true;
  let stage: "request" | "focused_board_lookup" | "catalog_loading" | "recommendation" | "result_persistence" = "request";
  let stageStartedAt = performance.now();
  const beginStage = (next: typeof stage) => {
    stage = next;
    stageStartedAt = performance.now();
  };
  try {
    const { riderInput, purchasePreferences, focusedBoardSlug } =
      recommendationRequestSchema.parse(await request.json());
    signal.throwIfAborted();
    parsingInput = false;
    beginStage("focused_board_lookup");
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
    beginStage("catalog_loading");
    const { products, familyKeyByProductId } =
      await withDbDiagnosticStage("catalog_loading", () => getRecommendationCatalog());
    signal.throwIfAborted();

    if (products.length === 0) {
      reportQuizLifecycleEvent(
        requestId,
        "catalog_loading",
        performance.now() - stageStartedAt,
        "service_unavailable",
      );
      return NextResponse.json(
        {
          message: "Не удалось загрузить каталог. Попробуй ещё раз немного позже.",
        },
        { status: 503 },
      );
    }

    beginStage("recommendation");
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
    beginStage("result_persistence");
    try {
      savedResultToken = await withDbDiagnosticStage("result_persistence", () => runPublicDbWork("optional", 2_000, () => сохранитьРезультатКвиза({
      вход: riderInput,
      результат: responseRecommendation,
      purchasePreferences,
      идентификаторСессии: request.headers.get("x-edgefit-session-id"),
      })));
    } catch {
      reportQuizLifecycleEvent(
        requestId,
        "result_persistence",
        performance.now() - stageStartedAt,
        "optional_persistence_unavailable",
      );
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
    if (error instanceof OperationDeadlineError || error instanceof PublicDbUnavailableError) {
      reportQuizLifecycleEvent(
        requestId,
        stage,
        performance.now() - stageStartedAt,
        error instanceof OperationDeadlineError
          ? "operation_deadline"
          : error.code === "PUBLIC_DB_SATURATED"
            ? "admission_saturation"
            : "database_unavailable",
      );
      return NextResponse.json({ message: "Сервис временно недоступен. Попробуй ещё раз немного позже." }, { status: 503 });
    }
    reportQuizLifecycleEvent(
      requestId,
      stage,
      performance.now() - stageStartedAt,
      parsingInput ? "request_rejected" : "server_error",
    );
    return publicApiError("recommendation", error, parsingInput, "Проверь параметры райдера и попробуй снова.");
  }
}
