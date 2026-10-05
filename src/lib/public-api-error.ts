import { NextResponse } from "next/server";
import { ZodError } from "zod";

const safeValidationMessages = new Set([
  "Укажите корректный адрес почты.",
  "Нужно согласие на получение результата по почте.",
]);

export function publicApiError(
  endpoint: "recommendation" | "analytics" | "email-leads",
  error: unknown,
  parsingInput: boolean,
  validationMessage: string,
) {
  if (parsingInput && (error instanceof ZodError || error instanceof SyntaxError)) {
    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).find((text) => safeValidationMessages.has(text)) ?? validationMessage
      : "Не удалось прочитать запрос. Проверь формат данных.";
    return NextResponse.json({ message }, { status: 400 });
  }
  // Deliberately exclude exception text, stack, request values and identifiers.
  console.error(JSON.stringify({ event: "public_api_failure", endpoint, category: "unexpected_server_error" }));
  return NextResponse.json({ message: "Сервис временно недоступен. Попробуй ещё раз позже." }, { status: 500 });
}
