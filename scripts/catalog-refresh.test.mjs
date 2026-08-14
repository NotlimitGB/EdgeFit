import { describe, expect, it, vi } from "vitest";
import {
  parseCatalogRefreshArgs,
  runCatalogRefreshCli,
} from "./catalog-refresh.mjs";

describe("manual catalog refresh identity authorization", () => {
  it("accepts no review hash for unattended AUTO-only execution", () => {
    expect(parseCatalogRefreshArgs([])).toEqual({});
  });

  it("rejects unknown arguments and malformed hashes before pipeline access", async () => {
    expect(() => parseCatalogRefreshArgs(["--unknown"])).toThrow("Usage:");
    const runPipeline = vi.fn();
    await expect(
      runCatalogRefreshCli({
        args: ["--expected-identity-review-hash", "ABC"],
        runPipeline,
        logger: { log() {} },
      }),
    ).rejects.toThrow("64 lowercase hexadecimal characters");
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("delegates the exact execution-scoped review hash", async () => {
    const expectedIdentityReviewHash = "a".repeat(64);
    const runPipeline = vi.fn().mockResolvedValue({ ok: true });
    await runCatalogRefreshCli({
      args: ["--expected-identity-review-hash", expectedIdentityReviewHash],
      runPipeline,
      logger: { log() {} },
    });
    expect(runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ expectedIdentityReviewHash }),
    );
  });
});
