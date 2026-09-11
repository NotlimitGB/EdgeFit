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

export async function POST(request: Request) {
  try {
    const { riderInput, purchasePreferences, focusedBoardSlug } =
      recommendationRequestSchema.parse(await request.json());
    const focusedBoardResolution = focusedBoardSlug
      ? await resolveCanonicalBoardRouteBySlug(focusedBoardSlug)
      : undefined;

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
      await getRecommendationCatalog();

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

    const savedResultToken = await сохранитьРезультатКвиза({
      вход: riderInput,
      результат: responseRecommendation,
      purchasePreferences,
      идентификаторСессии: request.headers.get("x-edgefit-session-id"),
    });

    const response = NextResponse.json(responseRecommendation);

    if (savedResultToken) {
      response.headers.set(SAVED_RESULT_TOKEN_HEADER, savedResultToken);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Невалидные данные для подбора.",
      },
      { status: 400 },
    );
  }
}
