import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isCatalogRefreshPipelineError,
  runCatalogRefreshPipeline,
} from "./lib/catalog-refresh-pipeline.mjs";

export async function runManualCatalogRefresh(options = {}) {
  return runCatalogRefreshPipeline(options);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    const result = await runManualCatalogRefresh({ logger: console });
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
      console.error(JSON.stringify({ stage: error.stage, state: error.state }));
    } else {
      console.error("Catalog refresh pipeline failed.");
    }
    process.exitCode = 1;
  }
}
