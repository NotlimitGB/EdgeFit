import type { MetadataRoute } from "next";
import { getAllProductSlugs } from "@/lib/products";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = [
    "",
    "/quiz",
    "/result",
    "/catalog",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    ...seoLandingPages.map((page) => getSeoLandingPath(page.slug)),
  ];

  let slugs: string[] = [];

  try {
    slugs = await getAllProductSlugs();
  } catch (error) {
    console.error("Не удалось собрать slugs для sitemap, отдаём только статические страницы.", error);
  }

  return [
    ...routes.map((route) => ({
      url: getAbsoluteSiteUrl(route),
      changeFrequency: route === "" ? ("weekly" as const) : ("monthly" as const),
      priority: route === "" ? 1 : 0.7,
    })),
    ...slugs.map((slug) => ({
      url: getAbsoluteSiteUrl(`/boards/${slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
