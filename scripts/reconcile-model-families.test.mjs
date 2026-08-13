import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(new URL("./reconcile-model-families.mjs", import.meta.url));

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

  it("gates the exact in-transaction plan after both locks and before mutations", () => {
    const source = readFileSync(scriptPath, "utf8");
    const applySource = source.slice(source.indexOf("async function runApply"));
    const firstLock = applySource.indexOf("BACKFILL_LOCK_KEY");
    const secondLock = applySource.indexOf("RECONCILIATION_LOCK_KEY");
    const buildCurrent = applySource.indexOf("const before = await buildCurrent(tx)");
    const fingerprintGate = applySource.indexOf(
      "const planFingerprint = assertModelFamilyMutationPlanFingerprint",
    );
    const mutation = applySource.indexOf("const mutation = await applyMutations(tx, before");
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
});
