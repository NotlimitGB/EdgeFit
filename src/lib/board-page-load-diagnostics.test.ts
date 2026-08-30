import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createBoardPageDiagnostics } from "@/lib/board-page-load-diagnostics";

interface LoggedBoardPageEvent {
  scope: string;
  traceId: string;
  stage: string;
  event: string;
  durationMs?: number;
  errorName?: string;
  errorCode?: string;
}

function makeHarness(times: number[] = [0, 1]) {
  const info = vi.fn<(message: string) => void>();
  const error = vi.fn<(message: string) => void>();
  const diagnostics = createBoardPageDiagnostics({
    logger: { info, error },
    now: () => times.shift() ?? 0,
    createTraceId: () => "trace-board-page",
  });

  return {
    diagnostics,
    info,
    error,
    infoEvents: () =>
      info.mock.calls.map(
        ([message]) => JSON.parse(message) as LoggedBoardPageEvent,
      ),
    errorEvents: () =>
      error.mock.calls.map(
        ([message]) => JSON.parse(message) as LoggedBoardPageEvent,
      ),
  };
}

describe("board-page load diagnostics", () => {
  it("returns the original value and logs narrative lookup timing", async () => {
    const harness = makeHarness([10, 24]);
    const product = { id: "product-1" };

    await expect(
      harness.diagnostics.runStage("narrative_product_lookup", () => product),
    ).resolves.toBe(product);

    expect(harness.infoEvents()).toEqual([
      {
        scope: "board_page",
        traceId: "trace-board-page",
        stage: "narrative_product_lookup",
        event: "start",
      },
      {
        scope: "board_page",
        traceId: "trace-board-page",
        stage: "narrative_product_lookup",
        event: "success",
        durationMs: 14,
      },
    ]);
    expect(harness.error).not.toHaveBeenCalled();
  });

  it("logs sanitized error metadata and rethrows the original failure", async () => {
    const harness = makeHarness([100, 109]);
    const failure = Object.assign(
      new Error(
        "select * from products using DATABASE_URL=postgres://user:secret@host/db",
      ),
      { name: "PostgresError", code: "57P01" },
    );

    await expect(
      harness.diagnostics.runStage("narrative_product_lookup", () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(harness.errorEvents()).toEqual([
      {
        scope: "board_page",
        traceId: "trace-board-page",
        stage: "narrative_product_lookup",
        event: "error",
        durationMs: 9,
        errorName: "PostgresError",
        errorCode: "57P01",
      },
    ]);
    const serialized = JSON.stringify(harness.errorEvents());
    expect(serialized).not.toContain("select *");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("stack");
  });

  it("remains fail-open when logging or the clock throws", async () => {
    const loggerFailure = new Error("logger unavailable");
    const diagnostics = createBoardPageDiagnostics({
      logger: {
        info() {
          throw loggerFailure;
        },
        error() {
          throw loggerFailure;
        },
      },
      now() {
        throw new Error("clock unavailable");
      },
      createTraceId: () => "trace-fail-open",
    });
    const result = { unchanged: true };

    await expect(
      diagnostics.runStage("narrative_product_lookup", () => result),
    ).resolves.toBe(result);

    const originalFailure = new Error("lookup failed");
    await expect(
      diagnostics.runStage("narrative_product_lookup", () => {
        throw originalFailure;
      }),
    ).rejects.toBe(originalFailure);
  });
});
