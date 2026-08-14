import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  databaseConfigured: vi.fn(),
  runPipeline: vi.fn(),
}));

vi.mock("@/lib/database/config", () => ({
  базаНастроена: mocks.databaseConfigured,
}));

vi.mock("../../../../../scripts/lib/catalog-refresh-pipeline.mjs", () => ({
  runCatalogRefreshPipeline: mocks.runPipeline,
  isCatalogRefreshPipelineError: (error: unknown) =>
    Boolean(
      error &&
        typeof error === "object" &&
        "isPipelineError" in error &&
        error.isPipelineError === true,
    ),
}));

import { GET, maxDuration, runtime } from "./route";

function request(token?: string) {
  return new Request("http://localhost/api/cron/catalog-refresh", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function successResult() {
  return {
    state: {
      stage: "complete",
      catalogRefreshCompleted: true,
      catalogAuditPassed: true,
      familyPreviewCompleted: true,
      familyApplyExecuted: false,
      familyApplyCompleted: false,
      familyPostPreviewNoop: true,
    },
    refresh: { importedModels: 10 },
    audit: { summary: { active_products: 9 }, warningChecks: [] },
    familyReconciliation: {
      mode: "NOOP",
      preview: { newFamilies: 0 },
      apply: null,
      postPreview: { newFamilies: 0 },
    },
  };
}

describe("catalog refresh cron route", () => {
  const previousSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    mocks.databaseConfigured.mockReturnValue(true);
    mocks.runPipeline.mockResolvedValue(successResult());
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  it("preserves the node runtime and 300-second duration", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(300);
  });

  it("returns 401 for an unauthorized request", async () => {
    const response = await GET(request("wrong-secret"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Unauthorized." });
    expect(mocks.runPipeline).not.toHaveBeenCalled();
  });

  it("returns 500 when DATABASE_URL is unavailable", async () => {
    mocks.databaseConfigured.mockReturnValue(false);
    const response = await GET(request("cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "DATABASE_URL is not configured.",
    });
    expect(mocks.runPipeline).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is unavailable", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "CRON_SECRET is not configured.",
    });
    expect(mocks.runPipeline).not.toHaveBeenCalled();
  });

  it("returns compact stage summaries for a successful full pipeline", async () => {
    const result = successResult();
    mocks.runPipeline.mockResolvedValue(result);
    const response = await GET(request("cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: "Catalog refresh pipeline completed successfully.",
      ...result,
    });
    expect(mocks.runPipeline).toHaveBeenCalledWith({ logger: console });
  });

  it("returns sanitized partial-completion evidence on family failure", async () => {
    const error = Object.assign(
      new Error("Guarded family reconciliation failed after catalog import."),
      {
        isPipelineError: true,
        stage: "family-apply",
        state: {
          catalogRefreshCompleted: true,
          familyApplyExecuted: true,
          familyApplyCompleted: false,
        },
        catalogMayHaveCommitted: true,
      },
    );
    error.stack = "DATABASE_URL=secret-value";
    mocks.runPipeline.mockRejectedValue(error);

    const response = await GET(request("cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      message: "Guarded family reconciliation failed after catalog import.",
      stage: "family-apply",
      state: error.state,
      catalogMayHaveCommitted: true,
    });
    expect(JSON.stringify(body)).not.toContain("secret-value");
  });

  it("returns sanitized identity-review evidence and proves no catalog commit", async () => {
    const sourceIdentityAuthorization = {
      counts: { AUTO: 376, REVIEW: 1, BLOCK: 0 },
      reasonCounts: { COLLISION_SUFFIX_REVIEW: 1 },
      identityReviewPlanHash: "a".repeat(64),
      reviewGroups: [
        { baseSlug: "review-board", reasonCodes: ["COLLISION_SUFFIX_REVIEW"] },
      ],
      blockGroups: [],
    };
    const error = Object.assign(new Error("hidden raw URL"), {
      isPipelineError: true,
      stage: "source-identity-authorization",
      state: {
        catalogRefreshCompleted: false,
        familyApplyExecuted: false,
      },
      catalogMayHaveCommitted: false,
      sourceIdentityAuthorization,
    });
    mocks.runPipeline.mockRejectedValue(error);

    const response = await GET(request("cron-secret"));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toEqual({
      message: "hidden raw URL",
      stage: "source-identity-authorization",
      state: error.state,
      catalogMayHaveCommitted: false,
      sourceIdentityAuthorization,
    });
    expect(JSON.stringify(body)).not.toContain("trial-sport.ru");
    expect(JSON.stringify(body)).not.toContain("traektoria.ru");
  });

  it("does not expose unexpected error details", async () => {
    mocks.runPipeline.mockRejectedValue(
      new Error("postgres://user:password@example.test/database"),
    );
    const response = await GET(request("cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Catalog refresh pipeline failed.",
    });
  });
});
