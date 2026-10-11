export const QUIZ_REQUEST_ID_HEADER = "x-snowdex-request-id";

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type QuizDiagnosticStage =
  | "request"
  | "focused_board_lookup"
  | "catalog_loading"
  | "recommendation"
  | "result_persistence"
  | "response_headers"
  | "response_body"
  | "response"
  | "result_navigation";

export type QuizDiagnosticCategory =
  | "started"
  | "success"
  | "request_rejected"
  | "service_unavailable"
  | "operation_deadline"
  | "admission_saturation"
  | "database_unavailable"
  | "server_error"
  | "optional_persistence_unavailable"
  | "client_timeout"
  | "network_failure"
  | "body_read_failure"
  | "api_rejection"
  | "invalid_response"
  | "navigation_timeout";

export function isQuizRequestId(value: string | null | undefined): value is string {
  return typeof value === "string" && requestIdPattern.test(value);
}

export function createQuizRequestId(): string | undefined {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues !== "function") return undefined;

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function reportQuizLifecycleEvent(
  requestId: string,
  stage: QuizDiagnosticStage,
  durationMs: number,
  category: QuizDiagnosticCategory,
) {
  if (!isQuizRequestId(requestId)) return;
  try {
    console.info(
      JSON.stringify({
        event: "quiz_lifecycle",
        requestId,
        stage,
        durationMs: Math.max(0, Math.round(durationMs)),
        category,
      }),
    );
  } catch {
    // Diagnostics must never change quiz behavior.
  }
}
