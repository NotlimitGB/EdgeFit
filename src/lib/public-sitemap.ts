import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { LEGACY_CANONICAL_BOARD_SLUG_ALIASES } from "@/lib/canonical-board-route";
import { getPublicCanonicalCatalogItems } from "@/lib/public-catalog-cache";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

const explicitLegacyAliasSources = new Set(
  Object.keys(LEGACY_CANONICAL_BOARD_SLUG_ALIASES),
);

class SitemapUnavailableError extends Error {
  readonly code = "SITEMAP_UNAVAILABLE";
  constructor() { super("Canonical sitemap data is temporarily unavailable."); }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Keep XML request-time while allowing the shared Next.js Data Cache lookup.
  await connection();
  const routes = [
    "",
    "/quiz",
    "/catalog",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    ...seoLandingPages.map((page) => getSeoLandingPath(page.slug)),
  ];

  let slugs: string[];
  try {
    const models = await getPublicCanonicalCatalogItems("sitemap");
    slugs = models.map(({ slug }) => slug);
  } catch (error) {
    let code: unknown;
    try { code = (error as { code?: unknown } | null)?.code; } catch { /* hostile error getter */ }
    const category = code === "OPERATION_DEADLINE" ? "operation_deadline"
      : code === "PUBLIC_DB_SATURATED" ? "admission_saturation"
        : "canonical_corpus_unavailable";
    try { console.error(JSON.stringify({ event: "public_route_failure", route: "sitemap", category })); } catch { /* diagnostics are fail-open */ }
    throw new SitemapUnavailableError();
  }

  return [
    ...routes.map((route) => ({
      url: getAbsoluteSiteUrl(route),
      changeFrequency: route === "" ? ("weekly" as const) : ("monthly" as const),
      priority: route === "" ? 1 : 0.7,
    })),
    ...[...new Set(slugs)]
      .filter((slug) => !explicitLegacyAliasSources.has(slug))
      .map((slug) => ({
        url: getAbsoluteSiteUrl(`/boards/${slug}`),
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })),
  ];
}
