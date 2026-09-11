import type { MetadataRoute } from "next";
import { getAllCanonicalBoardSlugs } from "@/lib/canonical-catalog";
import { LEGACY_CANONICAL_BOARD_SLUG_ALIASES } from "@/lib/canonical-board-route";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

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
  } catch (error) {
    console.error("Не удалось собрать canonical board slugs для sitemap, отдаём только статические страницы.", error);
  }

  return [
    ...routes.map((route) => ({
      url: getAbsoluteSiteUrl(route),
      changeFrequency: route === "" ? ("weekly" as const) : ("monthly" as const),
      priority: route === "" ? 1 : 0.7,
    })),
    ...slugs
      .filter((slug) => !explicitLegacyAliasSources.has(slug))
      .map((slug) => ({
        url: getAbsoluteSiteUrl(`/boards/${slug}`),
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })),
  ];
}
