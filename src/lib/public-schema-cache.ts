import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { получитьКлиентБазы } from "@/lib/database/client";
import { получитьАдресБазы, получитьРежимSsl } from "@/lib/database/config";
import { readProductColumnSupport } from "@/lib/database/product-column-support";
import { measurePublicLoad } from "@/lib/public-load-diagnostics";

export function getPublicDatabaseNamespace() {
  // Opaque cache isolation only. Neither credentials nor digest enter diagnostics.
  return createHash("sha256")
    .update(JSON.stringify([получитьАдресБазы(), получитьРежимSsl()]))
    .digest("hex");
}

const loadSchema = unstable_cache(
  async (namespace: string, hourBucket: number) => {
    // Arguments form Next's cache key; they are intentionally not SQL or log input.
    void namespace;
    void hourBucket;
    return measurePublicLoad("schema_cache_miss", () => readProductColumnSupport(получитьКлиентБазы()));
  },
  ["snowdex-public-schema-support-v1"],
  { revalidate: 3600 },
);

export async function getPublicSchemaSupport(namespace: string, now = Date.now()) {
  // Call outside catalog/board unstable_cache: nested lookups bypass Next's cache.
  return measurePublicLoad("schema_cache_lookup", () =>
    loadSchema(namespace, Math.floor(now / 3_600_000)));
}
