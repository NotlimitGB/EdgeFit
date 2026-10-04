import { describe, expect, it, vi } from "vitest";
import type { PublicCatalogItem } from "@/lib/public-catalog-dto";
import {
  buildLegacyCanonicalBoardSlugAliases,
  LEGACY_CANONICAL_BOARD_SLUG_ALIASES,
  resolveCanonicalBoardRoute,
} from "@/lib/canonical-board-route";

interface TestItem {
  slug: string;
  label: string;
}

const expectedAliases = {
  "jones-frontier": "jones-frontier-2-0",
  "nitro-team-2025-2026": "nitro-team",
  "ride-warpig-trial-sport-3137774": "ride-warpig",
};

function makeResolver(options: {
  items?: TestItem[];
  familyAliases?: Record<string, string>;
}) {
  const items = new Map((options.items ?? []).map((item) => [item.slug, item]));
  const familyAliases = options.familyAliases ?? {};
  const loadCanonicalItemBySlug = vi.fn(async (slug: string) => items.get(slug));
  const loadFamilyAliasTargetBySlug = vi.fn(
    async (slug: string) => familyAliases[slug],
  );

  return {
    loadCanonicalItemBySlug,
    loadFamilyAliasTargetBySlug,
    resolve(requestedSlug: string) {
      return resolveCanonicalBoardRoute({
        requestedSlug,
        loadCanonicalItemBySlug,
        loadFamilyAliasTargetBySlug,
      });
    },
  };
}

describe("legacy canonical board slug aliases", () => {
  it("contains the three live mappings without the retired Bataleon target", () => {
    expect(LEGACY_CANONICAL_BOARD_SLUG_ALIASES).toEqual(expectedAliases);
    expect(Object.keys(LEGACY_CANONICAL_BOARD_SLUG_ALIASES)).toHaveLength(3);
  });

  it("rejects empty, duplicate, self-referential, cyclic, and chained aliases", () => {
    expect(() => buildLegacyCanonicalBoardSlugAliases([["", "target"]])).toThrow();
    expect(() => buildLegacyCanonicalBoardSlugAliases([["source", ""]])).toThrow();
    expect(() =>
      buildLegacyCanonicalBoardSlugAliases([
        ["source", "target-a"],
        ["source", "target-b"],
      ]),
    ).toThrow(/Duplicate/);
    expect(() => buildLegacyCanonicalBoardSlugAliases([["same", "same"]])).toThrow(
      /self-referential/,
    );
    expect(() =>
      buildLegacyCanonicalBoardSlugAliases([
        ["first", "second"],
        ["second", "first"],
      ]),
    ).toThrow(/another alias source/);
    expect(() =>
      buildLegacyCanonicalBoardSlugAliases([
        ["first", "second"],
        ["second", "final"],
      ]),
    ).toThrow(/another alias source/);
  });
});

describe("resolveCanonicalBoardRoute", () => {
  it("resolves every published catalog fixture without substituting Bataleon seasons", async () => {
    const bataleonSlug = "bataleon-evil-twin-trial-sport-3131268";
    function publishedItem(slug: string, seasonLabel: string | null = null): PublicCatalogItem {
      return {
        slug, seasonLabel, brand: slug.startsWith("bataleon-") ? "Bataleon" : slug.split("-")[0],
        modelName: slug.startsWith("bataleon-") ? "EVIL TWIN" : slug,
        priceFrom: null, defaultOfferSlug: slug, media: [],
        canonicalSpecs: { descriptionShort: "", ridingStyle: null, skillLevel: null,
          boardLine: null, shapeType: null, camberProfile: null },
        searchText: slug, availableSizeCount: 0, availabilityPreview: "", widthTypes: [],
      };
    }
    // The inactive unsuffixed Bataleon target is deliberately absent. Older
    // seasons exist but must never become a fallback for the published 25/26 item.
    const published = [
      publishedItem(bataleonSlug, "2025/2026"),
      publishedItem("bataleon-evil-twin-2024-2025", "2024/2025"),
      ...Object.entries(expectedAliases).flatMap(([source, target]) => [
        publishedItem(source), publishedItem(target),
      ]),
    ];
    const items = new Map(published.map((item) => [item.slug, item]));
    const loadItem = vi.fn(async (slug: string) => items.get(slug));
    const loadFamilyAlias = vi.fn(async () => undefined);
    // Reproduce the original failure without changing the fail-closed contract.
    await expect(resolveCanonicalBoardRoute({
      requestedSlug: bataleonSlug, loadCanonicalItemBySlug: loadItem,
      loadFamilyAliasTargetBySlug: loadFamilyAlias,
      legacyAliases: { [bataleonSlug]: "bataleon-evil-twin" },
    })).resolves.toBeUndefined();
    loadItem.mockClear();
    for (const item of published) {
      const resolution = await resolveCanonicalBoardRoute({
        requestedSlug: item.slug, loadCanonicalItemBySlug: loadItem,
        loadFamilyAliasTargetBySlug: loadFamilyAlias,
      });
      expect(resolution, item.slug).toBeDefined();
      expect(items.get(resolution!.item.slug)).toBe(resolution!.item);
      if (resolution!.kind === "render") {
        expect(resolution!.item).toBe(item);
      } else {
        expect(resolution!.canonicalSlug).toBe(expectedAliases[item.slug as keyof typeof expectedAliases]);
      }
      if (item.slug === bataleonSlug) {
        expect(resolution).toEqual({ kind: "render", item });
        expect(resolution!.item.seasonLabel).toBe("2025/2026");
      }
    }
    expect(loadItem).not.toHaveBeenCalledWith("bataleon-evil-twin");
    expect(loadFamilyAlias).not.toHaveBeenCalled();
  });

  it.each(Object.entries(expectedAliases))(
    "redirects explicit alias %s even when an exact source item exists",
    async (legacySlug, canonicalSlug) => {
      const source = { slug: legacySlug, label: "Legacy source" };
      const target = { slug: canonicalSlug, label: "Canonical target" };
      const resolver = makeResolver({ items: [source, target] });

      await expect(resolver.resolve(legacySlug)).resolves.toEqual({
        kind: "redirect",
        item: target,
        canonicalSlug,
      });
      expect(resolver.loadCanonicalItemBySlug).toHaveBeenCalledTimes(1);
      expect(resolver.loadCanonicalItemBySlug).toHaveBeenCalledWith(canonicalSlug);
      expect(resolver.loadFamilyAliasTargetBySlug).not.toHaveBeenCalled();
    },
  );

  it("renders a normal exact active item before consulting a family alias", async () => {
    const suffix = "jones-mountain-twin";
    const resolver = makeResolver({
      items: [{ slug: suffix, label: "Current active suffix" }],
    });

    await expect(resolver.resolve(suffix)).resolves.toEqual({
      kind: "render",
      item: { slug: suffix, label: "Current active suffix" },
    });
    expect(resolver.loadCanonicalItemBySlug).toHaveBeenCalledTimes(1);
    expect(resolver.loadFamilyAliasTargetBySlug).not.toHaveBeenCalled();
  });

  it("renders Jones Frontier 2.0 directly without consulting an alias", async () => {
    const canonical = {
      slug: "jones-frontier-2-0",
      label: "Jones Frontier 2.0",
    };
    const resolver = makeResolver({ items: [canonical] });

    await expect(resolver.resolve(canonical.slug)).resolves.toEqual({
      kind: "render",
      item: canonical,
    });
    expect(resolver.loadCanonicalItemBySlug).toHaveBeenCalledTimes(1);
    expect(resolver.loadFamilyAliasTargetBySlug).not.toHaveBeenCalled();
  });

  it.each(Object.entries(expectedAliases))(
    "redirects future retired slug %s directly to %s",
    async (legacySlug, canonicalSlug) => {
      const target = { slug: canonicalSlug, label: "Canonical target" };
      const resolver = makeResolver({ items: [target] });

      await expect(resolver.resolve(legacySlug)).resolves.toEqual({
        kind: "redirect",
        item: target,
        canonicalSlug,
      });
      expect(resolver.loadCanonicalItemBySlug).toHaveBeenCalledWith(canonicalSlug);
      expect(resolver.loadCanonicalItemBySlug).toHaveBeenCalledTimes(1);
      expect(resolver.loadFamilyAliasTargetBySlug).not.toHaveBeenCalled();
    },
  );

  it("fails closed when a legacy alias target is missing or mismatched", async () => {
    const missing = makeResolver({});
    await expect(missing.resolve("nitro-team-2025-2026")).resolves.toBeUndefined();
    expect(missing.loadFamilyAliasTargetBySlug).not.toHaveBeenCalled();

    const mismatched = makeResolver({});
    mismatched.loadCanonicalItemBySlug.mockResolvedValueOnce({
      slug: "unexpected-target",
      label: "Wrong target",
    });
    await expect(mismatched.resolve("nitro-team-2025-2026")).resolves.toBeUndefined();
    expect(mismatched.loadCanonicalItemBySlug).toHaveBeenCalledTimes(1);
    expect(mismatched.loadCanonicalItemBySlug).toHaveBeenCalledWith("nitro-team");
    expect(mismatched.loadFamilyAliasTargetBySlug).not.toHaveBeenCalled();
  });

  it("preserves the existing Product-offer to ModelFamily redirect", async () => {
    const familyItem = { slug: "family-canonical", label: "Family" };
    const resolver = makeResolver({
      items: [familyItem],
      familyAliases: { "family-offer": familyItem.slug },
    });

    await expect(resolver.resolve("family-offer")).resolves.toEqual({
      kind: "redirect",
      item: familyItem,
      canonicalSlug: familyItem.slug,
    });
  });

  it("leaves an unrelated unknown slug unresolved", async () => {
    const resolver = makeResolver({});
    await expect(resolver.resolve("unknown-board")).resolves.toBeUndefined();
  });
});
