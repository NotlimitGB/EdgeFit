import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runModelFamilyReconciliationCli } from "./reconcile-model-families.mjs";

const scriptPath = fileURLToPath(new URL("./reconcile-model-families.mjs", import.meta.url));
const runnerPath = fileURLToPath(
  new URL("./lib/model-family-reconciliation-runner.mjs", import.meta.url),
);

function runCli(args) {
  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: environment,
    encoding: "utf8",
  });
}

describe("model family reconciliation CLI authorization", () => {
  it("rejects APPLY without an expected fingerprint before opening the database", () => {
    const result = runCli(["--apply"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "APPLY requires --expected-plan-fingerprint <64-lowercase-hex>",
    );
    expect(result.stderr).not.toContain("DATABASE_URL is not set");
  });

  it("rejects malformed expected fingerprints before opening the database", () => {
    for (const fingerprint of ["abc", "A".repeat(64), "g".repeat(64)]) {
      const result = runCli(["--apply", "--expected-plan-fingerprint", fingerprint]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Expected plan fingerprint must be 64 lowercase hexadecimal characters",
      );
      expect(result.stderr).not.toContain("DATABASE_URL is not set");
    }
  });

  it("delegates a valid guarded APPLY to the shared runner", async () => {
    const fingerprint = "a".repeat(64);
    const applyCalls = [];
    const report = { mode: "APPLY" };

    await expect(
      runModelFamilyReconciliationCli({
        args: ["--apply", "--expected-plan-fingerprint", fingerprint],
        environment: { DATABASE_URL: "postgres://not-opened" },
        logger: { log() {} },
        applyModelFamilyReconciliation: async (options) => {
          applyCalls.push(options);
          return report;
        },
      }),
    ).resolves.toBe(report);

    expect(applyCalls).toHaveLength(1);
    expect(applyCalls[0]).toEqual(
      expect.objectContaining({
        expectedPlanFingerprint: fingerprint,
        writeReportToFile: true,
      }),
    );
  });

  it("keeps PREVIEW available through the shared runner", async () => {
    const previewCalls = [];
    const report = { actions: { blockingConflicts: [] } };

    await expect(
      runModelFamilyReconciliationCli({
        args: [],
        environment: { DATABASE_URL: "postgres://not-opened" },
        logger: { log() {} },
        previewModelFamilyReconciliation: async (options) => {
          previewCalls.push(options);
          return report;
        },
      }),
    ).resolves.toBe(report);

    expect(previewCalls).toHaveLength(1);
  });

  it("gates the exact in-transaction plan after both locks and before mutations", () => {
    const source = readFileSync(runnerPath, "utf8");
    const applySource = source.slice(
      source.indexOf("export async function applyModelFamilyReconciliation"),
    );
    const firstLock = applySource.indexOf("BACKFILL_LOCK_KEY");
    const secondLock = applySource.indexOf("RECONCILIATION_LOCK_KEY");
    const buildCurrent = applySource.indexOf("const before = await buildCurrent(tx)");
    const fingerprintGate = applySource.indexOf(
      "const planFingerprint = assertModelFamilyMutationPlanFingerprint",
    );
    const mutation = applySource.indexOf("const mutation = await applyMutations(");
    const countGate = applySource.indexOf("assertModelFamilyMutationCounts(before.plan, mutation)");
    const postState = applySource.indexOf("const after = await buildCurrent(tx)");

    expect(firstLock).toBeGreaterThan(-1);
    expect(secondLock).toBeGreaterThan(firstLock);
    expect(buildCurrent).toBeGreaterThan(secondLock);
    expect(fingerprintGate).toBeGreaterThan(buildCurrent);
    expect(mutation).toBeGreaterThan(fingerprintGate);
    expect(countGate).toBeGreaterThan(mutation);
    expect(postState).toBeGreaterThan(countGate);
    expect(applySource).toContain("hasReconciliationMutations(after.plan)");
    expect(applySource).toContain("canonicalStringify(before.sourceSnapshot)");
  });

  it("keeps package entrypoints preview-only and on the shared refresh pipeline", () => {
    const packageJson = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    );

    expect(packageJson.scripts["catalog:reconcile-families"]).toBe(
      "node --env-file=.env.local scripts/reconcile-model-families.mjs",
    );
    expect(packageJson.scripts["catalog:refresh"]).toBe(
      "node --env-file=.env.local scripts/catalog-refresh.mjs",
    );
    expect(packageJson.scripts["catalog:refresh"]).not.toContain(
      "catalog:repair-waist",
    );
  });
});
