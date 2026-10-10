import { describe, expect, it } from "vitest";
import {
  CANONICAL_MODEL_DIRECTORY_PAGE_SIZE,
  getCanonicalModelDirectoryPage,
  parseCanonicalModelDirectoryPageParam,
  sortCanonicalModelDirectoryEntries,
  type CanonicalModelDirectoryEntry,
} from "@/lib/canonical-model-directory";

function makeCorpus(count: number): CanonicalModelDirectoryEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    slug: `board-${String(index + 1).padStart(3, "0")}`,
    brand: `Brand ${Math.floor(index / 17)}`,
    modelName: `Model ${index % 17}`,
    seasonLabel: index % 2 === 0 ? "2025/2026" : "2026/2027",
  }));
}

describe("canonical model directory pagination", () => {
  it("covers a 558-entry corpus exactly once over 24 pages", () => {
    const sorted = sortCanonicalModelDirectoryEntries(makeCorpus(558));
    const pages = Array.from({ length: 24 }, (_, index) =>
      getCanonicalModelDirectoryPage(sorted, index + 1),
    );
    const links = pages.flatMap(({ entries }) => entries.map(({ slug }) => slug));

    expect(pages.map(({ entries }) => entries.length)).toEqual([
      ...Array.from({ length: 23 }, () => CANONICAL_MODEL_DIRECTORY_PAGE_SIZE),
      6,
    ]);
    expect(new Set(links).size).toBe(558);
    expect(new Set(links)).toEqual(new Set(sorted.map(({ slug }) => slug)));
    expect(pages.every(({ pageCount, totalCount }) => pageCount === 24 && totalCount === 558)).toBe(true);
  });

  it("sorts by brand, model, season, then canonical slug and keeps seasons distinct", () => {
    const entries: CanonicalModelDirectoryEntry[] = [
      { slug: "yes-basic-2026", brand: "YES", modelName: "Basic", seasonLabel: "2026/2027" },
      { slug: "bataleon-evil-twin", brand: "Bataleon", modelName: "Evil Twin", seasonLabel: "2025/2026" },
      { slug: "yes-basic-2025", brand: "YES", modelName: "Basic", seasonLabel: "2025/2026" },
      { slug: "yes-basic-extra", brand: "YES", modelName: "Basic", seasonLabel: "2025/2026" },
    ];

    expect(sortCanonicalModelDirectoryEntries(entries).map(({ slug }) => slug)).toEqual([
      "bataleon-evil-twin",
      "yes-basic-2025",
      "yes-basic-extra",
      "yes-basic-2026",
    ]);
  });

  it("rejects empty and duplicate canonical slugs", () => {
    expect(() => sortCanonicalModelDirectoryEntries([
      { slug: "", brand: "A", modelName: "B", seasonLabel: null },
    ])).toThrow(/empty slug/);
    expect(() => sortCanonicalModelDirectoryEntries([
      { slug: "same", brand: "A", modelName: "B", seasonLabel: "2025/2026" },
      { slug: "same", brand: "A", modelName: "B", seasonLabel: "2026/2027" },
    ])).toThrow(/duplicate slug/);
  });

  it("accepts only canonical positive page parameters", () => {
    expect(parseCanonicalModelDirectoryPageParam(undefined)).toEqual({ kind: "page", page: 1 });
    expect(parseCanonicalModelDirectoryPageParam("1")).toEqual({ kind: "redirect-first" });
    expect(parseCanonicalModelDirectoryPageParam("24")).toEqual({ kind: "page", page: 24 });

    for (const value of ["0", "-1", "1.5", "01", "+2", "", "9007199254740992"]) {
      expect(parseCanonicalModelDirectoryPageParam(value)).toEqual({ kind: "invalid" });
    }
    expect(parseCanonicalModelDirectoryPageParam(["2", "3"])).toEqual({ kind: "invalid" });
  });

  it("does not return entries for a page outside the known corpus", () => {
    const result = getCanonicalModelDirectoryPage(sortCanonicalModelDirectoryEntries(makeCorpus(558)), 25);
    expect(result.entries).toEqual([]);
    expect(result.pageCount).toBe(24);
  });
});
