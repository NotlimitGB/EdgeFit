import { NextResponse } from "next/server";
import { сохранитьРезультатКвиза } from "@/lib/quiz-results";
import { получитьВсеМодели } from "@/lib/products";
import { getRecommendation } from "@/lib/recommendation/engine";
import { quizSubmissionSchema } from "@/lib/quiz/schema";

export async function POST(request: Request) {
  try {
    const payload = quizSubmissionSchema.parse(await request.json());
    const модели = await получитьВсеМодели();
    const recommendation = getRecommendation(payload, модели);

    await сохранитьРезультатКвиза({
      вход: payload,
      результат: recommendation,
      идентификаторСессии: request.headers.get("x-edgefit-session-id"),
    });

    return NextResponse.json(recommendation);
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
