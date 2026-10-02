import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { loadPublicCanonicalBoard } from "@/lib/canonical-catalog";
import { getCanonicalNarrativeOfferSlug } from "@/lib/canonical-board-detail";
import { получитьКлиентБазы } from "@/lib/database/client";
import { базаНастроена } from "@/lib/database/config";
import type { ProductColumnSupport } from "@/lib/database/product-column-support";
import { getPublicDatabaseNamespace, getPublicSchemaSupport } from "@/lib/public-schema-cache";
import { measurePublicLoad } from "@/lib/public-load-diagnostics";
import { createBoardPageDiagnostics } from "@/lib/board-page-load-diagnostics";

class UnresolvedBoard extends Error {}

export async function loadPublicBoardNarrative(slug: string) {
  const sql = получитьКлиентБазы();
  const [row] = await sql<{ scenarios: string[] | null; notIdealFor: string[] | null }[]>`
    select p.scenarios as "scenarios", p.not_ideal_for as "notIdealFor"
    from products p where p.slug = ${slug} and p.is_active = true limit 1
  `;
  return {
    scenarios: Array.isArray(row?.scenarios) ? row.scenarios : [],
    notIdealFor: Array.isArray(row?.notIdealFor) ? row.notIdealFor : [],
  };
}

const loadBoard = unstable_cache(
  async (_namespace: string, slug: string, support: ProductColumnSupport) =>
    measurePublicLoad("board_cache_miss", async () => {
      const resolution = await loadPublicCanonicalBoard(slug, support);
      // Rejections aren't written as successful long-lived not-found entries.
      if (!resolution) throw new UnresolvedBoard();
      const narrativeSlug = resolution.kind === "render"
        ? getCanonicalNarrativeOfferSlug(resolution.item) : null;
      const narrative = narrativeSlug
        ? await createBoardPageDiagnostics().runStage("narrative_product_lookup", () =>
          loadPublicBoardNarrative(narrativeSlug))
        : { scenarios: [], notIdealFor: [] };
      return { resolution, narrative };
    }),
  ["snowdex-public-board-v1"],
  { revalidate: 3600, tags: ["edgefit-public-canonical-catalog"] },
);

export const getPublicBoardBundle = cache(async (slug: string) => {
  if (!базаНастроена()) return undefined;
  const namespace = getPublicDatabaseNamespace();
  const support = await getPublicSchemaSupport(namespace);
  try {
    return await measurePublicLoad("board_cache_lookup", () => loadBoard(namespace, slug, support));
  } catch (error) {
    if (error instanceof UnresolvedBoard) return undefined;
    throw error;
  }
});
