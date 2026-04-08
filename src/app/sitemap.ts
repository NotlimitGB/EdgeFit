import type { MetadataRoute } from "next";
import { получитьВсеМодели } from "@/lib/products";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";

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

  const модели = await получитьВсеМодели();

  return [
    ...routes.map((route) => ({
      url: `https://edgefit.example${route}`,
      changeFrequency: route === "" ? ("weekly" as const) : ("monthly" as const),
      priority: route === "" ? 1 : 0.7,
    })),
    ...модели.map((модель) => ({
      url: `https://edgefit.example/boards/${модель.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
