import { runCatalogAudit } from "../audit-catalog.mjs";
import { runStoreImport } from "../import-from-stores.mjs";
import {
  applyModelFamilyReconciliation,
  hasFamilyReconciliationActions,
  isFamilyReconciliationNoop,
  previewModelFamilyReconciliation,
} from "./model-family-reconciliation-runner.mjs";

function compactChecks(checks) {
  return checks.map(({ title, severity, count, passed }) => ({
    title,
    severity,
    count,
    passed,
  }));
}

function compactAudit(audit) {
  return {
    summary: audit.report.summary,
    failedChecks: compactChecks(audit.failedChecks),
    warningChecks: compactChecks(audit.warningChecks),
  };
}

function compactRefresh(refresh) {
  return {
    checkedAt: refresh.checkedAt,
    sourceIdentityPlanHash: refresh.sourceIdentityPlanHash,
    sourceFilter: refresh.sourceFilter,
    warningCount: refresh.warnings?.length ?? 0,
    importedModels: refresh.importedModels,
    importedSizes: refresh.importedSizes,
    cleanedBrokenTrialSizes: refresh.cleanedBrokenTrialSizes,
    repairedWaistWidths: refresh.repairedWaistWidths,
    mergedProducts: refresh.mergedProducts,
    activeProducts: refresh.activeProducts,
    draftProducts: refresh.draftProducts,
    verifiedProducts: refresh.verifiedProducts,
  };
}

function compactFamilyReport(report) {
  return {
    fingerprint: report.planFingerprint,
    newFamilies: report.actions.newFamilies.length,
    newMemberships: report.actions.newMemberships.length,
    metadataUpdates: report.actions.canonicalMetadataUpdates.length,
    blockingConflicts: report.actions.blockingConflicts.length,
  };
}

function cloneState(state) {
  return structuredClone(state);
}

export class CatalogRefreshPipelineError extends Error {
  constructor({ stage, message, state, cause, catalogMayHaveCommitted }) {
    super(message, cause ? { cause } : undefined);
    this.name = "CatalogRefreshPipelineError";
    this.stage = stage;
    this.state = cloneState(state);
    this.catalogMayHaveCommitted = catalogMayHaveCommitted;
  }
}

function fail(
  stage,
  message,
  state,
  cause,
  catalogMayHaveCommitted = state.catalogRefreshCompleted,
) {
  throw new CatalogRefreshPipelineError({
    stage,
    message,
    state,
    cause,
    catalogMayHaveCommitted,
  });
}

export function isCatalogRefreshPipelineError(error) {
  return error instanceof CatalogRefreshPipelineError;
}

export async function runCatalogRefreshPipeline(options = {}) {
  const logger = options.logger ?? console;
  const importCatalog = options.runStoreImport ?? runStoreImport;
  const auditCatalog = options.runCatalogAudit ?? runCatalogAudit;
  const previewFamilies =
    options.previewModelFamilyReconciliation ??
    previewModelFamilyReconciliation;
  const applyFamilies =
    options.applyModelFamilyReconciliation ?? applyModelFamilyReconciliation;
  const commonOptions = {
    databaseUrl: options.databaseUrl,
    sslMode: options.sslMode,
    logger,
  };
  const state = {
    stage: "catalog-import",
    catalogRefreshCompleted: false,
    catalogAuditPassed: false,
    familyPreviewCompleted: false,
    familyApplyExecuted: false,
    familyApplyCompleted: false,
    familyPostPreviewNoop: false,
  };
  let refresh;
  let audit;
  let familyPreview;
  let familyApply = null;
  let familyPostPreview = null;

  try {
    refresh = await importCatalog(commonOptions);
    state.catalogRefreshCompleted = true;
  } catch (error) {
    // runStoreImport may throw after its bulk transaction committed (for example,
    // during post-import cleanup), so callers must treat this outcome as uncertain.
    fail("catalog-import", "Catalog import failed.", state, error, true);
  }

  state.stage = "catalog-audit";
  try {
    audit = await auditCatalog({
      ...commonOptions,
      writeReportToFile: false,
    });
  } catch (error) {
    fail("catalog-audit", "Catalog audit failed after catalog import.", state, error);
  }
  if (audit.failedChecks.length > 0) {
    fail(
      "catalog-audit",
      "Catalog audit found blocking issues after catalog import.",
      state,
    );
  }
  state.catalogAuditPassed = true;

  state.stage = "family-preview";
  try {
    familyPreview = await previewFamilies({
      ...commonOptions,
      writeReportToFile: false,
    });
    state.familyPreviewCompleted = true;
  } catch (error) {
    fail(
      "family-preview",
      "Family reconciliation preview failed after catalog import.",
      state,
      error,
    );
  }
  if (familyPreview.actions.blockingConflicts.length > 0) {
    fail(
      "family-preview",
      "Family reconciliation preview found blocking conflicts.",
      state,
    );
  }

  if (!hasFamilyReconciliationActions(familyPreview)) {
    state.stage = "complete";
    state.familyPostPreviewNoop = true;
    return {
      ok: true,
      state: cloneState(state),
      refresh: compactRefresh(refresh),
      audit: compactAudit(audit),
      familyReconciliation: {
        mode: "NOOP",
        preview: compactFamilyReport(familyPreview),
        apply: null,
        postPreview: compactFamilyReport(familyPreview),
      },
    };
  }

  state.stage = "family-apply";
  state.familyApplyExecuted = true;
  try {
    familyApply = await applyFamilies({
      ...commonOptions,
      expectedPlanFingerprint: familyPreview.planFingerprint,
      writeReportToFile: false,
    });
    state.familyApplyCompleted = true;
  } catch (error) {
    fail(
      "family-apply",
      "Guarded family reconciliation failed after catalog import.",
      state,
      error,
    );
  }

  state.stage = "family-post-preview";
  try {
    familyPostPreview = await previewFamilies({
      ...commonOptions,
      writeReportToFile: false,
    });
  } catch (error) {
    fail(
      "family-post-preview",
      "Family post-apply verification failed.",
      state,
      error,
    );
  }
  if (!isFamilyReconciliationNoop(familyPostPreview)) {
    fail(
      "family-post-preview",
      "Family post-apply verification is not idempotent.",
      state,
    );
  }

  state.stage = "complete";
  state.familyPostPreviewNoop = true;
  return {
    ok: true,
    state: cloneState(state),
    refresh: compactRefresh(refresh),
    audit: compactAudit(audit),
    familyReconciliation: {
      mode: "APPLIED",
      preview: compactFamilyReport(familyPreview),
      apply: {
        fingerprint: familyApply.planFingerprint,
        fingerprintMatch: familyApply.planFingerprintMatch,
        mutation: familyApply.mutation,
      },
      postPreview: compactFamilyReport(familyPostPreview),
    },
  };
}
