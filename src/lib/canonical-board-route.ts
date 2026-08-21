export type CanonicalBoardRouteResult<TItem extends { slug: string }> =
  | {
      kind: "render";
      item: TItem;
    }
  | {
      kind: "redirect";
      item: TItem;
      canonicalSlug: string;
    };

type LegacyBoardSlugAliasEntries = readonly (readonly [string, string])[];

export function buildLegacyCanonicalBoardSlugAliases(
  entries: LegacyBoardSlugAliasEntries,
): Readonly<Record<string, string>> {
  const aliases: Record<string, string> = Object.create(null);

  for (const [source, target] of entries) {
    if (!source.trim() || !target.trim()) {
      throw new Error("Legacy canonical board aliases require non-empty slugs.");
    }
    if (source === target) {
      throw new Error(`Legacy canonical board alias ${source} is self-referential.`);
    }
    if (Object.hasOwn(aliases, source)) {
      throw new Error(`Duplicate legacy canonical board alias source ${source}.`);
    }

    aliases[source] = target;
  }

  for (const [source, target] of Object.entries(aliases)) {
    if (Object.hasOwn(aliases, target)) {
      throw new Error(
        `Legacy canonical board alias ${source} points to another alias source ${target}.`,
      );
    }
  }

  return Object.freeze(aliases);
}

export const LEGACY_CANONICAL_BOARD_SLUG_ALIASES =
  buildLegacyCanonicalBoardSlugAliases([
    ["bataleon-evil-twin-trial-sport-3131268", "bataleon-evil-twin"],
    ["nitro-team-2025-2026", "nitro-team"],
    ["ride-warpig-trial-sport-3137774", "ride-warpig"],
    ["jones-frontier", "jones-frontier-2-0"],
  ] as const);

interface ResolveCanonicalBoardRouteOptions<TItem extends { slug: string }> {
  requestedSlug: string;
  loadCanonicalItemBySlug: (slug: string) => Promise<TItem | undefined>;
  loadFamilyAliasTargetBySlug: (slug: string) => Promise<string | undefined>;
  legacyAliases?: Readonly<Record<string, string>>;
}

export async function resolveCanonicalBoardRoute<
  TItem extends { slug: string },
>({
  requestedSlug,
  loadCanonicalItemBySlug,
  loadFamilyAliasTargetBySlug,
  legacyAliases = LEGACY_CANONICAL_BOARD_SLUG_ALIASES,
}: ResolveCanonicalBoardRouteOptions<TItem>): Promise<
  CanonicalBoardRouteResult<TItem> | undefined
> {
  const exactItem = await loadCanonicalItemBySlug(requestedSlug);
  if (exactItem) {
    return {
      kind: "render",
      item: exactItem,
    };
  }

  const legacyTarget = legacyAliases[requestedSlug];
  if (legacyTarget) {
    const targetItem = await loadCanonicalItemBySlug(legacyTarget);
    if (!targetItem || targetItem.slug !== legacyTarget) {
      return undefined;
    }

    return {
      kind: "redirect",
      item: targetItem,
      canonicalSlug: legacyTarget,
    };
  }

  const familyTarget = await loadFamilyAliasTargetBySlug(requestedSlug);
  if (!familyTarget) {
    return undefined;
  }

  const familyItem = await loadCanonicalItemBySlug(familyTarget);
  if (!familyItem) {
    return undefined;
  }

  return {
    kind: "redirect",
    item: familyItem,
    canonicalSlug: familyItem.slug,
  };
}
