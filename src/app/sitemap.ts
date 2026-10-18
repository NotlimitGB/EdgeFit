import type { MetadataRoute } from "next";
import { randomUUID } from "node:crypto";
import { getAllCanonicalBoardSlugs } from "@/lib/canonical-catalog";
import { LEGACY_CANONICAL_BOARD_SLUG_ALIASES } from "@/lib/canonical-board-route";
import { базаНастроена } from "@/lib/database/config";
import { PublicDbUnavailableError } from "@/lib/database/operation-boundary";
import { runPublicDbWork } from "@/lib/database/public-work";
import { withDbDiagnosticContext } from "@/lib/database/lifecycle-diagnostics";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

// Build without DB access; resolve the current corpus on every runtime request.
export const dynamic = "force-dynamic";

const explicitLegacyAliasSources = new Set(
  Object.keys(LEGACY_CANONICAL_BOARD_SLUG_ALIASES),
);

class SitemapUnavailableError extends Error {
  readonly code = "SITEMAP_UNAVAILABLE";
  constructor() { super("Canonical sitemap data is temporarily unavailable."); }
}

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

  let slugs: string[];
  try {
    if (!базаНастроена()) throw new PublicDbUnavailableError("PUBLIC_DB_UNAVAILABLE");
    slugs = await withDbDiagnosticContext(
      { scope: "sitemap", stage: "canonical_corpus", traceId: randomUUID() },
      () => runPublicDbWork("critical", 15_000, () => getAllCanonicalBoardSlugs()),
    );
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
