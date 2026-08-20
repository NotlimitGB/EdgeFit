import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runModelFamilyReconciliationCli } from "./reconcile-model-families.mjs";
import { applyAutomaticContinuityUpdate } from "./lib/model-family-reconciliation-runner.mjs";

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

  it("keeps an automatic continuity replacement atomic when the new-base guard fails", async () => {
    const update = {
      familyId: "family-1",
      identityKey: "v1|nitro|team|2025/2026",
      oldFamilySlug: "nitro-team-2025-2026",
      newFamilySlug: "nitro-team",
      canonicalSourceKind: "fallback-member",
      oldBaseProductId: "old-base",
      oldBaseProductSlug: "nitro-team-2025-2026",
      newBaseProductId: "new-base",
      newBaseProductSlug: "nitro-team",
      wideProductId: "wide",
      wideProductSlug: "nitro-team-wide",
      matchMethod: "audit-high-v1",
      confidence: "high",
      manualOverride: false,
      reason: "automatic continuity",
      canonicalMetadataChanges: { descriptionShort: "New" },
      canonicalMetadataTarget: { descriptionShort: "New" },
    };
    let state = {
      products: {
        "old-base": {
          familyId: "family-1",
          role: "base",
          active: false,
        },
        "new-base": { familyId: null, role: null, active: true },
        wide: { familyId: "family-1", role: "wide", active: true },
      },
      family: { id: "family-1", slug: "nitro-team-2025-2026" },
    };
    const before = structuredClone(state);
    const tx = async (strings) => {
      const query = strings.join("?").replace(/\s+/gu, " ").trim();
      if (query.startsWith("select id from products") && query.includes("for update")) {
        return state.products.wide.familyId === "family-1" &&
          state.products.wide.role === "wide" &&
          state.products.wide.active
          ? [{ id: "wide" }]
          : [];
      }
      if (query.startsWith("update products set family_id = null")) {
        const oldBase = state.products["old-base"];
        if (
          oldBase.familyId !== "family-1" ||
          oldBase.role !== "base" ||
          oldBase.active
        ) {
          return [];
        }
        oldBase.familyId = null;
        oldBase.role = null;
        return [{ id: "old-base" }];
      }
      if (
        query.startsWith("update products set family_id = ?") &&
        query.includes("family_member_role = 'base'")
      ) {
        return [];
      }
      throw new Error(`Unexpected fake SQL: ${query}`);
    };
    const sql = {
      async begin(_mode, callback) {
        const snapshot = structuredClone(state);
        try {
          return await callback(tx);
        } catch (error) {
          state = snapshot;
          throw error;
        }
      },
    };

    await expect(
      sql.begin("isolation level serializable", (transaction) =>
        applyAutomaticContinuityUpdate(
          transaction,
          update,
          "2026-08-20T00:00:00.000Z",
        ),
      ),
    ).rejects.toThrow("Could not safely assign replacement automatic base new-base");
    expect(state).toEqual(before);
  });

  it("orders guarded continuity SQL as Wide, old base, new base, then family", () => {
    const source = readFileSync(runnerPath, "utf8");
    const continuitySource = source.slice(
      source.indexOf("export async function applyAutomaticContinuityUpdate"),
      source.indexOf("async function applyMutations"),
    );
    const wideGuard = continuitySource.indexOf("select id");
    const clearOldBase = continuitySource.indexOf("set family_id = null");
    const assignNewBase = continuitySource.indexOf(
      "set family_id = ${update.familyId}",
    );
    const updateFamily = continuitySource.indexOf("update model_families");
    expect(wideGuard).toBeGreaterThan(-1);
    expect(clearOldBase).toBeGreaterThan(wideGuard);
    expect(assignNewBase).toBeGreaterThan(clearOldBase);
    expect(updateFamily).toBeGreaterThan(assignNewBase);
    expect(continuitySource).toContain("for update");
    expect(continuitySource).toContain("family_manual_override = false");
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
