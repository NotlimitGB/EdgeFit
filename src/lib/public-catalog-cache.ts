import "server-only";

import { unstable_cache } from "next/cache";
import { loadPublicCanonicalCatalog } from "@/lib/canonical-catalog";
import { базаНастроена } from "@/lib/database/config";
import { withCatalogReadClient } from "@/lib/database/catalog-read-client";
import { readProductColumnSupport } from "@/lib/database/product-column-support";
import { getPublicDatabaseNamespace } from "@/lib/public-schema-cache";
import { toPublicCatalogItems } from "@/lib/public-catalog-dto";
import { measurePublicLoad } from "@/lib/public-load-diagnostics";
import { runPublicDbWork } from "@/lib/database/public-work";
import { PublicDbUnavailableError } from "@/lib/database/operation-boundary";
import { randomUUID } from "node:crypto";
import { withDbDiagnosticContext } from "@/lib/database/lifecycle-diagnostics";
import type { PublicCatalogItem } from "@/lib/public-catalog-dto";

const PUBLIC_CATALOG_CACHE_KEY = "edgefit-public-canonical-catalog-v9";
const PUBLIC_CATALOG_CACHE_TAG = "edgefit-public-canonical-catalog";
const PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS = 300;

const activeRefreshes = new Map<string, Promise<PublicCatalogItem[]>>();

function refreshPublicCatalog(namespace: string) {
  const existing = activeRefreshes.get(namespace);
  if (existing) return existing;

  const refresh = measurePublicLoad("catalog_cache_miss", async () => {
    try {
      const items = await withCatalogReadClient(async (sql) => {
        const support = await measurePublicLoad("schema_cache_miss", () => readProductColumnSupport(sql));
        return toPublicCatalogItems(await loadPublicCanonicalCatalog(support, sql));
      });
      console.info(JSON.stringify({ event: "public_catalog_payload", itemCount: items.length,
        bytes: Buffer.byteLength(JSON.stringify(items), "utf8") }));
      return items;
    } catch {
      // Next logs background revalidation errors. Driver errors can carry SQL
      // and connection details, so only expose the safe category here.
      throw new PublicDbUnavailableError("PUBLIC_DB_UNAVAILABLE");
    }
  }).finally(() => { activeRefreshes.delete(namespace); });
  activeRefreshes.set(namespace, refresh);
  return refresh;
}

const loadCachedPublicCatalog = unstable_cache(
  refreshPublicCatalog,
  [PUBLIC_CATALOG_CACHE_KEY],
  {
    revalidate: PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_CATALOG_CACHE_TAG],
  },
);

export async function getPublicCanonicalCatalogItems() {
  return withDbDiagnosticContext(
    { scope: "canonical_catalog", stage: "public_catalog_loading", traceId: randomUUID() },
    () => runPublicDbWork("critical", 15_000, loadPublicCatalog));
}

async function loadPublicCatalog() {
  if (!базаНастроена()) throw new PublicDbUnavailableError("PUBLIC_DB_UNAVAILABLE");
  const namespace = getPublicDatabaseNamespace();
  return measurePublicLoad("catalog_cache_lookup", () => loadCachedPublicCatalog(namespace));
}
