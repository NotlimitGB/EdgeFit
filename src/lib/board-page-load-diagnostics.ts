import "server-only";

import { randomUUID } from "node:crypto";

export type BoardPageDiagnosticStage = "narrative_product_lookup";

interface BoardPageDiagnosticLogger {
  info(message: string): void;
  error(message: string): void;
}

interface BoardPageDiagnosticDependencies {
  logger?: BoardPageDiagnosticLogger;
  now?: () => number;
  createTraceId?: () => string;
}

const defaultLogger: BoardPageDiagnosticLogger = {
  info(message) {
    console.info(message);
  },
  error(message) {
    console.error(message);
  },
};

function safeOperationalToken(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return /^[a-z0-9_.-]{1,64}$/iu.test(normalized) ? normalized : fallback;
}

function getSafeErrorDetails(error: unknown) {
  const candidate =
    typeof error === "object" && error != null
      ? (error as { name?: unknown; code?: unknown })
      : {};

  return {
    errorName: safeOperationalToken(candidate.name, "Error"),
    errorCode:
      typeof candidate.code === "string"
        ? safeOperationalToken(candidate.code, "UNKNOWN")
        : "UNKNOWN",
  };
}

function emitBoardPageDiagnostic(
  logger: BoardPageDiagnosticLogger,
  level: "info" | "error",
  event: Record<string, unknown>,
) {
  try {
    logger[level](JSON.stringify(event));
  } catch {
    // Diagnostics must never alter board-page behavior.
  }
}

export function createBoardPageDiagnostics(
  dependencies: BoardPageDiagnosticDependencies = {},
) {
  const logger = dependencies.logger ?? defaultLogger;
  const now = dependencies.now ?? performance.now.bind(performance);
  const traceId = (dependencies.createTraceId ?? randomUUID)();
  const readNow = () => {
    try {
      return now();
    } catch {
      return 0;
    }
  };

  return {
    traceId,
    async runStage<T>(
      stage: BoardPageDiagnosticStage,
      operation: () => T | Promise<T>,
    ): Promise<T> {
      const startedAt = readNow();
      const baseEvent = {
        scope: "board_page",
        traceId,
        stage,
      };

      emitBoardPageDiagnostic(logger, "info", {
        ...baseEvent,
        event: "start",
      });

      try {
        const value = await operation();
        emitBoardPageDiagnostic(logger, "info", {
          ...baseEvent,
          event: "success",
          durationMs: Math.max(0, Math.round(readNow() - startedAt)),
        });
        return value;
      } catch (error) {
        emitBoardPageDiagnostic(logger, "error", {
          ...baseEvent,
          event: "error",
          durationMs: Math.max(0, Math.round(readNow() - startedAt)),
          ...getSafeErrorDetails(error),
        });
        throw error;
      }
    },
  };
}
