import "server-only";

import { unstable_cache } from "next/cache";
import { getAllCanonicalCatalogItems } from "@/lib/canonical-catalog";

const PUBLIC_CATALOG_CACHE_KEY = "edgefit-public-canonical-catalog-v1";
const PUBLIC_CATALOG_CACHE_TAG = "edgefit-public-canonical-catalog";
const PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS = 300;

const loadCachedPublicCatalog = unstable_cache(
  async () => getAllCanonicalCatalogItems(),
  [PUBLIC_CATALOG_CACHE_KEY],
  {
    revalidate: PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_CATALOG_CACHE_TAG],
  },
);

export async function getPublicCanonicalCatalogItems() {
  return loadCachedPublicCatalog();
}
