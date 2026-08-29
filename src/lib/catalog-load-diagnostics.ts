import "server-only";

import { randomUUID } from "node:crypto";

export type CanonicalCatalogLoadKind = "all" | "slug" | "alias";

export type CanonicalCatalogDiagnosticStage =
  | "canonical_catalog"
  | "product_column_support"
  | "family_rows"
  | "offer_rows"
  | "alias_rows"
  | "canonical_build";

export type CanonicalCatalogDiagnosticBranch =
  | "all"
  | "slug"
  | "family"
  | "singleton";

interface CatalogDiagnosticLogger {
  info(message: string): void;
  error(message: string): void;
}

interface CatalogDiagnosticDependencies {
  logger?: CatalogDiagnosticLogger;
  now?: () => number;
  createTraceId?: () => string;
}

interface CatalogDiagnosticStageOptions<T> {
  branch?: CanonicalCatalogDiagnosticBranch;
  rowCount?: (value: T) => number;
}

const defaultLogger: CatalogDiagnosticLogger = {
  info(message) {
    console.info(message);
  },
  error(message) {
    console.error(message);
  },
};

const ROW_COUNT_STAGES = new Set<CanonicalCatalogDiagnosticStage>([
  "canonical_catalog",
  "family_rows",
  "offer_rows",
  "alias_rows",
  "canonical_build",
]);

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

function emitCatalogDiagnostic(
  logger: CatalogDiagnosticLogger,
  level: "info" | "error",
  event: Record<string, unknown>,
) {
  try {
    logger[level](JSON.stringify(event));
  } catch {
    // Diagnostics must never alter catalog behavior.
  }
}

export interface CanonicalCatalogDiagnostics {
  readonly traceId: string;
  runStage<T>(
    stage: CanonicalCatalogDiagnosticStage,
    operation: () => T | Promise<T>,
    options?: CatalogDiagnosticStageOptions<T>,
  ): Promise<T>;
}

export function createCanonicalCatalogDiagnostics(
  loadKind: CanonicalCatalogLoadKind,
  dependencies: CatalogDiagnosticDependencies = {},
): CanonicalCatalogDiagnostics {
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
    async runStage(stage, operation, options = {}) {
      const startedAt = readNow();
      const baseEvent = {
        scope: "canonical_catalog",
        traceId,
        loadKind,
        stage,
        ...(options.branch ? { branch: options.branch } : {}),
      };

      emitCatalogDiagnostic(logger, "info", { ...baseEvent, event: "start" });

      try {
        const value = await operation();
        let rowCount: number | undefined;
        try {
          rowCount = ROW_COUNT_STAGES.has(stage)
            ? options.rowCount?.(value)
            : undefined;
        } catch {
          rowCount = undefined;
        }
        emitCatalogDiagnostic(logger, "info", {
          ...baseEvent,
          event: "success",
          durationMs: Math.max(0, Math.round(readNow() - startedAt)),
          ...(rowCount == null ? {} : { rowCount }),
        });
        return value;
      } catch (error) {
        emitCatalogDiagnostic(logger, "error", {
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
