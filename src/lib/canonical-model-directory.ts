import type { PublicCatalogItem } from "@/lib/public-catalog-dto";

export const CANONICAL_MODEL_DIRECTORY_PAGE_SIZE = 24;

export type CanonicalModelDirectoryEntry = Pick<
  PublicCatalogItem,
  "slug" | "brand" | "modelName" | "seasonLabel"
>;

export type CanonicalModelDirectoryPageParam =
  | { kind: "page"; page: number }
  | { kind: "redirect-first" }
  | { kind: "invalid" };

const russianCollator = new Intl.Collator("ru", {
  numeric: true,
  sensitivity: "base",
});

function compareText(left: string, right: string) {
  return russianCollator.compare(left, right) || (left < right ? -1 : left > right ? 1 : 0);
}

export function parseCanonicalModelDirectoryPageParam(
  value: string | string[] | undefined,
): CanonicalModelDirectoryPageParam {
  if (value === undefined) {
    return { kind: "page", page: 1 };
  }

  if (Array.isArray(value)) {
    return { kind: "invalid" };
  }

  if (value === "1") {
    return { kind: "redirect-first" };
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return { kind: "invalid" };
  }

  const page = Number(value);
  return Number.isSafeInteger(page) && page > 1
    ? { kind: "page", page }
    : { kind: "invalid" };
}

export function sortCanonicalModelDirectoryEntries(
  items: readonly CanonicalModelDirectoryEntry[],
): CanonicalModelDirectoryEntry[] {
  const seenSlugs = new Set<string>();
  const entries = items.map(({ slug, brand, modelName, seasonLabel }) => {
    if (!slug.trim()) {
      throw new Error("Canonical model directory contains an empty slug");
    }

    if (seenSlugs.has(slug)) {
      throw new Error("Canonical model directory contains a duplicate slug");
    }

    seenSlugs.add(slug);
    return { slug, brand, modelName, seasonLabel };
  });

  return entries.sort((left, right) =>
    compareText(left.brand, right.brand) ||
    compareText(left.modelName, right.modelName) ||
    compareText(left.seasonLabel ?? "", right.seasonLabel ?? "") ||
    compareText(left.slug, right.slug)
  );
}

export function getCanonicalModelDirectoryPage<T extends CanonicalModelDirectoryEntry>(
  sortedEntries: readonly T[],
  page: number,
) {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError("Canonical model directory page must be a positive integer");
  }

  const pageCount = Math.max(
    1,
    Math.ceil(sortedEntries.length / CANONICAL_MODEL_DIRECTORY_PAGE_SIZE),
  );
  const startIndex = (page - 1) * CANONICAL_MODEL_DIRECTORY_PAGE_SIZE;

  return {
    entries: sortedEntries.slice(startIndex, startIndex + CANONICAL_MODEL_DIRECTORY_PAGE_SIZE),
    page,
    pageCount,
    totalCount: sortedEntries.length,
    startIndex,
  };
}
