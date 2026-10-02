import "server-only";

import { unstable_cache } from "next/cache";
import { loadPublicCanonicalCatalog } from "@/lib/canonical-catalog";
import { базаНастроена } from "@/lib/database/config";
import type { ProductColumnSupport } from "@/lib/database/product-column-support";
import { getPublicDatabaseNamespace, getPublicSchemaSupport } from "@/lib/public-schema-cache";
import { toPublicCatalogItem } from "@/lib/public-catalog-dto";
import { measurePublicLoad } from "@/lib/public-load-diagnostics";

const PUBLIC_CATALOG_CACHE_KEY = "edgefit-public-canonical-catalog-v2";
const PUBLIC_CATALOG_CACHE_TAG = "edgefit-public-canonical-catalog";
const PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS = 300;

const loadCachedPublicCatalog = unstable_cache(
  async (_namespace: string, support: ProductColumnSupport) =>
    measurePublicLoad("catalog_cache_miss", async () => {
      const items = (await loadPublicCanonicalCatalog(support)).map(toPublicCatalogItem);
      console.info(JSON.stringify({ event: "public_catalog_payload", itemCount: items.length,
        bytes: Buffer.byteLength(JSON.stringify(items), "utf8") }));
      return items;
    }),
  [PUBLIC_CATALOG_CACHE_KEY],
  {
    revalidate: PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_CATALOG_CACHE_TAG],
  },
);

export async function getPublicCanonicalCatalogItems() {
  if (!базаНастроена()) return [];
  const namespace = getPublicDatabaseNamespace();
  const support = await getPublicSchemaSupport(namespace);
  return measurePublicLoad("catalog_cache_lookup", () => loadCachedPublicCatalog(namespace, support));
}
