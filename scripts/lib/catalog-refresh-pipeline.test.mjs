import { describe, expect, it, vi } from "vitest";
import {
  CatalogRefreshPipelineError,
  runCatalogRefreshPipeline,
} from "./catalog-refresh-pipeline.mjs";
import { SourceIdentityAuthorizationError } from "./store-import/source-identity-authorization.mjs";

function refreshResult() {
  return {
    checkedAt: "2026-08-13",
    sourceIdentityPlanHash: "plan-hash",
    sourceFilter: "all",
    warnings: [],
    importedModels: 10,
    importedSizes: 20,
    cleanedBrokenTrialSizes: 0,
    repairedWaistWidths: 0,
    mergedProducts: 10,
    activeProducts: 9,
    draftProducts: 1,
    verifiedProducts: 9,
  };
}

function auditResult({ failed = false } = {}) {
  const failedChecks = failed
    ? [{ title: "Blocking", severity: "error", count: 1, passed: false }]
    : [];
  return {
    report: { summary: { total_products: 10, active_products: 9 } },
    failedChecks,
    warningChecks: [],
  };
}

function familyReport({
  fingerprint = "a".repeat(64),
  families = 0,
  memberships = 0,
  updates = 0,
  blockers = 0,
  mode = "PREVIEW",
} = {}) {
  return {
    mode,
    planFingerprint: fingerprint,
    planFingerprintMatch: mode === "APPLY" ? true : null,
    actions: {
      newFamilies: Array.from({ length: families }, () => ({})),
      newMemberships: Array.from({ length: memberships }, () => ({})),
      canonicalMetadataUpdates: Array.from({ length: updates }, () => ({})),
      blockingConflicts: Array.from({ length: blockers }, () => ({})),
    },
    mutation: {
      insertedFamilies: families,
      assignedProducts: memberships,
      updatedFamilies: updates,
    },
  };
}

function dependencies(overrides = {}) {
  return {
    logger: { log() {} },
    runStoreImport: vi.fn().mockResolvedValue(refreshResult()),
    runCatalogAudit: vi.fn().mockResolvedValue(auditResult()),
    previewModelFamilyReconciliation: vi
      .fn()
      .mockResolvedValue(familyReport()),
    applyModelFamilyReconciliation: vi
      .fn()
      .mockResolvedValue(familyReport({ mode: "APPLY" })),
    ...overrides,
  };
}

describe("shared catalog refresh pipeline", () => {
  it("applies family changes with the preview fingerprint and verifies a post-NOOP", async () => {
    const fingerprint = "b".repeat(64);
    const preview = vi
      .fn()
      .mockResolvedValueOnce(
        familyReport({ fingerprint, families: 2, memberships: 4, updates: 1 }),
      )
      .mockResolvedValueOnce(familyReport());
    const apply = vi.fn().mockResolvedValue(
      familyReport({
        mode: "APPLY",
        fingerprint,
        families: 2,
        memberships: 4,
        updates: 1,
      }),
    );

    const result = await runCatalogRefreshPipeline(
      dependencies({
        previewModelFamilyReconciliation: preview,
        applyModelFamilyReconciliation: apply,
      }),
    );

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPlanFingerprint: fingerprint,
        writeReportToFile: false,
      }),
    );
    expect(preview).toHaveBeenCalledTimes(2);
    for (const [options] of preview.mock.calls) {
      expect(options.writeReportToFile).toBe(false);
    }
    expect(result.familyReconciliation.mode).toBe("APPLIED");
    expect(result.state).toEqual(
      expect.objectContaining({
        catalogRefreshCompleted: true,
        catalogAuditPassed: true,
        familyPreviewCompleted: true,
        familyApplyExecuted: true,
        familyApplyCompleted: true,
        familyPostPreviewNoop: true,
      }),
    );
  });

  it("skips APPLY when the first family preview is already a NOOP", async () => {
    const deps = dependencies();
    const result = await runCatalogRefreshPipeline(deps);

    expect(deps.applyModelFamilyReconciliation).not.toHaveBeenCalled();
    expect(deps.previewModelFamilyReconciliation).toHaveBeenCalledTimes(1);
    expect(
      Object.hasOwn(deps.runStoreImport.mock.calls[0][0], "expectedPlanHash"),
    ).toBe(false);
    expect(result.familyReconciliation.mode).toBe("NOOP");
    expect(result.state.familyPostPreviewNoop).toBe(true);
  });

  it("passes an execution-scoped identity review hash only to the importer", async () => {
    const deps = dependencies();
    const expectedIdentityReviewHash = "b".repeat(64);
    await runCatalogRefreshPipeline({
      ...deps,
      expectedIdentityReviewHash,
    });

    expect(deps.runStoreImport).toHaveBeenCalledWith(
      expect.objectContaining({ expectedIdentityReviewHash }),
    );
    expect(deps.runCatalogAudit.mock.calls[0][0]).not.toHaveProperty(
      "expectedIdentityReviewHash",
    );
  });

  it("reports a fail-closed identity authorization gate as pre-commit", async () => {
    const authorization = {
      counts: { AUTO: 9, REVIEW: 1, BLOCK: 0 },
      reviewGroups: [{ baseSlug: "review-board", reasonCodes: ["COLLISION_SUFFIX_REVIEW"] }],
      blockGroups: [],
      identityReviewPlanHash: "c".repeat(64),
    };
    const error = new SourceIdentityAuthorizationError({
      code: "SOURCE_IDENTITY_REVIEW_REQUIRED",
      message: "review required",
    });
    error.authorization = authorization;
    const deps = dependencies({ runStoreImport: vi.fn().mockRejectedValue(error) });

    await expect(runCatalogRefreshPipeline(deps)).rejects.toMatchObject({
      stage: "source-identity-authorization",
      catalogMayHaveCommitted: false,
      sourceIdentityAuthorization: authorization,
      state: { catalogRefreshCompleted: false },
    });
    expect(deps.runCatalogAudit).not.toHaveBeenCalled();
  });

  it("conservatively reports that a failed import may already have committed", async () => {
    const deps = dependencies({
      runStoreImport: vi.fn().mockRejectedValue(new Error("cleanup failed")),
    });

    await expect(runCatalogRefreshPipeline(deps)).rejects.toMatchObject({
      stage: "catalog-import",
      catalogMayHaveCommitted: true,
      state: {
        catalogRefreshCompleted: false,
        catalogAuditPassed: false,
        familyApplyExecuted: false,
      },
    });
    expect(deps.runCatalogAudit).not.toHaveBeenCalled();
    expect(deps.previewModelFamilyReconciliation).not.toHaveBeenCalled();
  });

  it("stops before family work when the catalog audit has blockers", async () => {
    const deps = dependencies({
      runCatalogAudit: vi.fn().mockResolvedValue(auditResult({ failed: true })),
    });

    await expect(runCatalogRefreshPipeline(deps)).rejects.toMatchObject({
      stage: "catalog-audit",
      catalogMayHaveCommitted: true,
      state: {
        catalogRefreshCompleted: true,
        catalogAuditPassed: false,
        familyPreviewCompleted: false,
        familyApplyExecuted: false,
      },
    });
    expect(deps.previewModelFamilyReconciliation).not.toHaveBeenCalled();
    expect(deps.applyModelFamilyReconciliation).not.toHaveBeenCalled();
  });

  it("stops before APPLY when family preview has blocking conflicts", async () => {
    const deps = dependencies({
      previewModelFamilyReconciliation: vi
        .fn()
        .mockResolvedValue(familyReport({ blockers: 1 })),
    });

    await expect(runCatalogRefreshPipeline(deps)).rejects.toMatchObject({
      stage: "family-preview",
      state: { familyPreviewCompleted: true, familyApplyExecuted: false },
    });
    expect(deps.applyModelFamilyReconciliation).not.toHaveBeenCalled();
  });

  it("reports fingerprint drift without retrying APPLY", async () => {
    const drift = new Error("Model-family plan fingerprint mismatch");
    const deps = dependencies({
      previewModelFamilyReconciliation: vi
        .fn()
        .mockResolvedValue(familyReport({ families: 1 })),
      applyModelFamilyReconciliation: vi.fn().mockRejectedValue(drift),
    });

    await expect(runCatalogRefreshPipeline(deps)).rejects.toBeInstanceOf(
      CatalogRefreshPipelineError,
    );
    expect(deps.applyModelFamilyReconciliation).toHaveBeenCalledTimes(1);
  });

  it("fails after APPLY when the post-preview is not idempotent", async () => {
    const preview = vi
      .fn()
      .mockResolvedValueOnce(familyReport({ families: 1 }))
      .mockResolvedValueOnce(familyReport({ updates: 1 }));
    const apply = vi.fn().mockResolvedValue(
      familyReport({ mode: "APPLY", families: 1 }),
    );

    await expect(
      runCatalogRefreshPipeline(
        dependencies({
          previewModelFamilyReconciliation: preview,
          applyModelFamilyReconciliation: apply,
        }),
      ),
    ).rejects.toMatchObject({
      stage: "family-post-preview",
      state: {
        familyApplyExecuted: true,
        familyApplyCompleted: true,
        familyPostPreviewNoop: false,
      },
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledTimes(2);
  });
});
