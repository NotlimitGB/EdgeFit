import { describe, expect, it, vi } from "vitest";
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
  "bataleon-evil-twin-trial-sport-3131268": "bataleon-evil-twin",
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
  it("contains exactly the three approved mappings and no Jones aliases", () => {
    expect(LEGACY_CANONICAL_BOARD_SLUG_ALIASES).toEqual(expectedAliases);
    expect(Object.keys(LEGACY_CANONICAL_BOARD_SLUG_ALIASES)).toHaveLength(3);
    expect(
      Object.keys(LEGACY_CANONICAL_BOARD_SLUG_ALIASES).some((slug) =>
        slug.startsWith("jones-"),
      ),
    ).toBe(false);
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
  it("renders an exact active item before consulting its legacy alias", async () => {
    const suffix = "nitro-team-2025-2026";
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
      expect(resolver.loadCanonicalItemBySlug).toHaveBeenNthCalledWith(1, legacySlug);
      expect(resolver.loadCanonicalItemBySlug).toHaveBeenNthCalledWith(2, canonicalSlug);
      expect(resolver.loadCanonicalItemBySlug).toHaveBeenCalledTimes(2);
      expect(resolver.loadFamilyAliasTargetBySlug).not.toHaveBeenCalled();
    },
  );

  it("fails closed when a legacy alias target is missing or mismatched", async () => {
    const missing = makeResolver({});
    await expect(missing.resolve("nitro-team-2025-2026")).resolves.toBeUndefined();
    expect(missing.loadFamilyAliasTargetBySlug).not.toHaveBeenCalled();

    const mismatched = makeResolver({
      items: [{ slug: "unexpected-target", label: "Wrong target" }],
    });
    mismatched.loadCanonicalItemBySlug.mockResolvedValueOnce(undefined);
    mismatched.loadCanonicalItemBySlug.mockResolvedValueOnce({
      slug: "unexpected-target",
      label: "Wrong target",
    });
    await expect(mismatched.resolve("nitro-team-2025-2026")).resolves.toBeUndefined();
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
