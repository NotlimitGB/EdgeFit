import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isCatalogRefreshPipelineError,
  runCatalogRefreshPipeline,
} from "./lib/catalog-refresh-pipeline.mjs";
import { normalizeExpectedIdentityReviewHash } from "./lib/store-import/source-identity-authorization.mjs";

export async function runManualCatalogRefresh(options = {}) {
  return runCatalogRefreshPipeline(options);
}

export function parseCatalogRefreshArgs(args = []) {
  if (args.length === 0) return {};
  if (args.length !== 2 || args[0] !== "--expected-identity-review-hash") {
    throw new Error(
      "Usage: catalog-refresh [--expected-identity-review-hash <64-lowercase-hex>]",
    );
  }
  return {
    expectedIdentityReviewHash: normalizeExpectedIdentityReviewHash(args[1]),
  };
}

export async function runCatalogRefreshCli({
  args = process.argv.slice(2),
  logger = console,
  runPipeline = runCatalogRefreshPipeline,
} = {}) {
  const options = parseCatalogRefreshArgs(args);
  return runPipeline({ ...options, logger });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    const result = await runCatalogRefreshCli({ logger: console });
    console.log(
      JSON.stringify(
        {
          message: "Catalog refresh pipeline completed successfully.",
          state: result.state,
          familyReconciliation: result.familyReconciliation,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (isCatalogRefreshPipelineError(error)) {
      console.error(error.message);
      console.error(
        JSON.stringify({
          stage: error.stage,
          state: error.state,
          sourceIdentityAuthorization: error.sourceIdentityAuthorization,
        }),
      );
    } else {
      console.error("Catalog refresh pipeline failed.");
    }
    process.exitCode = 1;
  }
}
