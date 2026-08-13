import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyModelFamilyReconciliation,
  previewModelFamilyReconciliation,
} from "./lib/model-family-reconciliation-runner.mjs";

const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

export function parseModelFamilyReconciliationArgs(args) {
  if (args.length === 0) {
    return { mode: "PREVIEW", expectedPlanFingerprint: null };
  }
  if (args[0] !== "--apply") {
    throw new Error(
      `Unknown arguments: ${args.join(" ")}. Supported modes are PREVIEW and --apply.`,
    );
  }
  if (args.length !== 3 || args[1] !== "--expected-plan-fingerprint") {
    throw new Error(
      "APPLY requires --expected-plan-fingerprint <64-lowercase-hex>.",
    );
  }
  if (!FINGERPRINT_PATTERN.test(args[2])) {
    throw new Error(
      "Expected plan fingerprint must be 64 lowercase hexadecimal characters.",
    );
  }
  return { mode: "APPLY", expectedPlanFingerprint: args[2] };
}

export async function runModelFamilyReconciliationCli(options = {}) {
  const args = options.args ?? process.argv.slice(2);
  const environment = options.environment ?? process.env;
  const logger = options.logger ?? console;
  const preview =
    options.previewModelFamilyReconciliation ??
    previewModelFamilyReconciliation;
  const apply =
    options.applyModelFamilyReconciliation ?? applyModelFamilyReconciliation;
  const { mode, expectedPlanFingerprint } =
    parseModelFamilyReconciliationArgs(args);

  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const runnerOptions = {
    databaseUrl: environment.DATABASE_URL,
    sslMode: environment.DATABASE_SSL === "disable" ? false : "require",
    logger,
    writeReportToFile: true,
    reportPath:
      environment.MODEL_FAMILY_RECONCILIATION_REPORT_PATH ??
      "reports/model-family-reconciliation.json",
  };

  if (mode === "PREVIEW") {
    const report = await preview(runnerOptions);
    if (report.actions.blockingConflicts.length) {
      throw new Error("Reconciliation has blocking conflicts.");
    }
    return report;
  }
  return apply({ ...runnerOptions, expectedPlanFingerprint });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    await runModelFamilyReconciliationCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
