import "server-only";

export async function measurePublicLoad<T>(
  stage: "schema_cache_lookup" | "schema_cache_miss" | "catalog_cache_lookup" |
    "catalog_cache_miss" | "board_cache_lookup" | "board_cache_miss",
  operation: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await operation();
    console.info(JSON.stringify({ event: "public_load", stage, status: "success",
      durationMs: Math.round(performance.now() - started) }));
    return result;
  } catch (error) {
    console.info(JSON.stringify({ event: "public_load", stage, status: "error",
      durationMs: Math.round(performance.now() - started) }));
    throw error;
  }
}
