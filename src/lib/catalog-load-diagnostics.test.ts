import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCanonicalCatalogDiagnostics,
  type CanonicalCatalogDiagnosticStage,
} from "@/lib/catalog-load-diagnostics";

interface LoggedCatalogEvent {
  scope: string;
  traceId: string;
  loadKind: string;
  stage: string;
  event: string;
  durationMs?: number;
  rowCount?: number;
  branch?: string;
  errorName?: string;
  errorCode?: string;
}

function makeHarness(times: number[] = [0, 5]) {
  const info = vi.fn<(message: string) => void>();
  const error = vi.fn<(message: string) => void>();
  const diagnostics = createCanonicalCatalogDiagnostics("all", {
    logger: { info, error },
    now: () => times.shift() ?? 0,
    createTraceId: () => "trace-025p0",
  });

  return {
    diagnostics,
    info,
    error,
    infoEvents: () =>
      info.mock.calls.map(([message]) => JSON.parse(message) as LoggedCatalogEvent),
    errorEvents: () =>
      error.mock.calls.map(
        ([message]) => JSON.parse(message) as LoggedCatalogEvent,
      ),
  };
}

describe("canonical catalog load diagnostics", () => {
  it("returns the original stage value and logs sanitized timing metadata", async () => {
    const harness = makeHarness([10, 24]);
    const rows = [{ id: "family-1" }, { id: "family-2" }];

    await expect(
      harness.diagnostics.runStage("family_rows", async () => rows, {
        branch: "all",
        rowCount: (value) => value.length,
      }),
    ).resolves.toBe(rows);

    expect(harness.infoEvents()).toEqual([
      {
        scope: "canonical_catalog",
        traceId: "trace-025p0",
        loadKind: "all",
        stage: "family_rows",
        branch: "all",
        event: "start",
      },
      {
        scope: "canonical_catalog",
        traceId: "trace-025p0",
        loadKind: "all",
        stage: "family_rows",
        branch: "all",
        event: "success",
        durationMs: 14,
        rowCount: 2,
      },
    ]);
    expect(harness.error).not.toHaveBeenCalled();
  });

  it("only emits row counts for stages where counts are operationally useful", async () => {
    const harness = makeHarness([0, 1]);

    await harness.diagnostics.runStage(
      "product_column_support",
      async () => ({ supported: true }),
      { rowCount: () => 99 },
    );

    expect(harness.infoEvents()[1]).not.toHaveProperty("rowCount");
  });

  it("logs only a safe error name and code before rethrowing the same error", async () => {
    const harness = makeHarness([100, 109]);
    const failure = Object.assign(
      new Error(
        "select * from products using DATABASE_URL=postgres://user:secret@host/db",
      ),
      { name: "PostgresError", code: "57P01" },
    );

    await expect(
      harness.diagnostics.runStage("offer_rows", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    const [event] = harness.errorEvents();
    expect(event).toMatchObject({
      scope: "canonical_catalog",
      traceId: "trace-025p0",
      loadKind: "all",
      stage: "offer_rows",
      event: "error",
      durationMs: 9,
      errorName: "PostgresError",
      errorCode: "57P01",
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("select *");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("secret");
    expect(event).not.toHaveProperty("message");
    expect(event).not.toHaveProperty("stack");
  });

  it("replaces unsafe error metadata instead of serializing it", async () => {
    const harness = makeHarness([0, 1]);
    const failure = {
      name: "DATABASE_URL=postgres://user:secret@host/db",
      code: "bad code with credentials",
    };

    await expect(
      harness.diagnostics.runStage("family_rows", () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(harness.errorEvents()[0]).toMatchObject({
      errorName: "Error",
      errorCode: "UNKNOWN",
    });
  });

  it("keeps diagnostics fail-open when logging or row counting fails", async () => {
    const loggerFailure = new Error("logger unavailable");
    const diagnostics = createCanonicalCatalogDiagnostics("all", {
      logger: {
        info() {
          throw loggerFailure;
        },
        error() {
          throw loggerFailure;
        },
      },
      now: () => 0,
      createTraceId: () => "trace-fail-open",
    });
    const result = { unchanged: true };

    await expect(
      diagnostics.runStage("canonical_build", () => result, {
        rowCount() {
          throw new Error("count unavailable");
        },
      }),
    ).resolves.toBe(result);

    const originalFailure = new Error("catalog failed");
    await expect(
      diagnostics.runStage("canonical_build", () => {
        throw originalFailure;
      }),
    ).rejects.toBe(originalFailure);
  });
});

describe("passive canonical catalog diagnostics", () => {
  it("keeps one trace across the existing database stages and build", async () => {
    const harness = makeHarness([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    const result = await harness.diagnostics.runStage(
      "canonical_catalog",
      async () => {
        await harness.diagnostics.runStage(
          "product_column_support",
          async () => true,
        );
        const families = await harness.diagnostics.runStage(
          "family_rows",
          async () => ["family"],
          { branch: "all", rowCount: (rows) => rows.length },
        );
        const offers = await harness.diagnostics.runStage(
          "offer_rows",
          async () => ["offer"],
          { branch: "all", rowCount: (rows) => rows.length },
        );
        return harness.diagnostics.runStage(
          "canonical_build",
          () => [...families, ...offers],
          { branch: "all", rowCount: (rows) => rows.length },
        );
      },
      { rowCount: (rows) => rows.length },
    );

    expect(result).toEqual(["family", "offer"]);
    expect(
      new Set(
        harness.infoEvents().map(({ traceId }) => traceId),
      ),
    ).toEqual(new Set(["trace-025p0"]));
    expect(harness.infoEvents().map(({ stage, event }) => [stage, event])).toEqual([
      ["canonical_catalog", "start"],
      ["product_column_support", "start"],
      ["product_column_support", "success"],
      ["family_rows", "start"],
      ["family_rows", "success"],
      ["offer_rows", "start"],
      ["offer_rows", "success"],
      ["canonical_build", "start"],
      ["canonical_build", "success"],
      ["canonical_catalog", "success"],
    ]);
  });

  it.each<CanonicalCatalogDiagnosticStage>([
    "product_column_support",
    "family_rows",
    "offer_rows",
    "canonical_build",
  ])("identifies a %s failure and then marks the outer load as failed", async (stage) => {
    const harness = makeHarness([0, 1, 2, 3, 4, 5]);
    const failure = Object.assign(new Error("private stage details"), {
      code: "XX000",
    });

    await expect(
      harness.diagnostics.runStage("canonical_catalog", () =>
        harness.diagnostics.runStage(stage, () => {
          throw failure;
        }),
      ),
    ).rejects.toBe(failure);

    expect(harness.errorEvents().map((event) => event.stage)).toEqual([
      stage,
      "canonical_catalog",
    ]);
  });
});
