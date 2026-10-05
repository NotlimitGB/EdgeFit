import type { MetadataRoute } from "next";
import { getAllCanonicalBoardSlugs } from "@/lib/canonical-catalog";
import { LEGACY_CANONICAL_BOARD_SLUG_ALIASES } from "@/lib/canonical-board-route";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

// Build without DB access; resolve the current corpus on every runtime request.
export const dynamic = "force-dynamic";

const explicitLegacyAliasSources = new Set(
  Object.keys(LEGACY_CANONICAL_BOARD_SLUG_ALIASES),
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  let slugs: string[] = [];

  try {
    slugs = await getAllCanonicalBoardSlugs();
  } catch {
    console.error("sitemap: canonical-corpus-unavailable; static-routes-only");
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
