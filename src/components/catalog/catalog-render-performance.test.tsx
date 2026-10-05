// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import * as ui from "./canonical-catalog-ui";
import { toPublicCatalogItems } from "@/lib/public-catalog-dto";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";
const mocks = vi.hoisted(() => ({ replace: vi.fn(), prefetch: vi.fn(), mounts: new Map<string, number>() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks, usePathname: () => "/catalog", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, prefetch, children, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) =>
  <a {...props} href={String(href)} data-prefetch={String(prefetch)}>{children}</a> }));
vi.mock("@/components/analytics/tracked-store-link", () => ({ TrackedStoreLink: function StoreLink({ analyticsPayload, ...props }: React.ComponentProps<"a"> & { analyticsPayload: { board_slug: string } }) {
  useEffect(() => { const slug = analyticsPayload.board_slug; mocks.mounts.set(slug, (mocks.mounts.get(slug) ?? 0) + 1); }, [analyticsPayload.board_slug]);
  return <a {...props} />;
} }));
import { CatalogView } from "./catalog-view";
import { CanonicalBoardCard } from "./canonical-board-card";

function fixture(index: number): CanonicalCatalogItem {
  const slug = `board-${String(index).padStart(3, "0")}`;
  return { familyId: null, slug, brand: index % 2 ? "Beta" : "Alpha", modelName: slug, seasonLabel: null,
    priceFrom: index * 1000, isActive: true, hasAvailableSize: true, defaultOfferSlug: slug, media: ["/first.svg", "/fallback.svg"],
    canonicalSpecs: { descriptionShort: null, descriptionFull: null, ridingStyle: "all-mountain", skillLevel: "intermediate",
      boardLine: "unisex", shapeType: "twin", camberProfile: "camber", flex: 5, dataStatus: "verified",
      canonicalSourceKind: "trusted-member", sourceName: "Fixture", sourceUrl: null, sourceCheckedAt: "2026-10-01" },
    offers: [], sizes: [] };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); mocks.mounts.clear(); mocks.replace.mockClear(); mocks.prefetch.mockClear(); sessionStorage.clear(); });

it("appends only 24 new real cards at 24→48→72→96 without rerendering existing cards or requesting routes", async () => {
  const boards = toPublicCatalogItems(Array.from({ length: 96 }, (_, index) => fixture(index + 1)));
  const priceRender = vi.spyOn(ui, "getCanonicalPricePresentation");
  render(<CatalogView boards={boards} />);
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(24));
  expect(priceRender).toHaveBeenCalledTimes(24);
  const initialTitles = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
  for (const expected of [48, 72, 96]) {
    fireEvent.click(screen.getByRole("button", { name: "Показать ещё 24" }));
    expect(screen.getAllByRole("article")).toHaveLength(expected);
    expect(priceRender).toHaveBeenCalledTimes(expected);
    expect(screen.getAllByRole("heading", { level: 3 }).slice(0, 24).map((node) => node.textContent)).toEqual(initialTitles);
    expect([...mocks.mounts.values()].every((count) => count === 1)).toBe(true);
    expect(mocks.mounts.size).toBe(expected);
  }
  expect(mocks.replace).not.toHaveBeenCalled(); expect(mocks.prefetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Поиск по каталогу"), { target: { value: "board-096" } });
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("board-096");
});

it("server ranks preserve all three old sort orders including unknown prices and freshness", () => {
  const original = Array.from({ length: 96 }, (_, index) => {
    const board = fixture(index);
    board.priceFrom = index % 4 ? 1000 * (index % 7) : null;
    board.canonicalSpecs.dataStatus = index % 3 ? "verified" : "draft";
    board.canonicalSpecs.sourceCheckedAt = index % 2 ? "2026-09-01" : "2026-10-01";
    return board;
  });
  const projected = toPublicCatalogItems(original);
  for (const compare of [ui.compareCanonicalFeatured, ui.compareCanonicalPriceAsc, ui.compareCanonicalPriceDesc]) {
    for (const keep of [(index: number) => index % 2 === 0, () => true]) {
      expect(projected.filter((_, index) => keep(index)).sort(compare).map((board) => board.slug))
        .toEqual(original.filter((_, index) => keep(index)).sort(compare).map((board) => board.slug));
    }
  }
});

it("preserves every normalized image fallback, lazy decoding and the final placeholder", () => {
  const original = fixture(1); original.media = [" /first.svg ", "/first.svg", "", "/fallback.svg", "/last.svg"];
  const [board] = toPublicCatalogItems([original]);
  render(<CanonicalBoardCard board={board} />);
  for (const url of ["/first.svg", "/fallback.svg", "/last.svg"]) {
    const image = screen.getByRole("img"); expect(image.getAttribute("src")).toBe(url);
    expect(image.getAttribute("loading")).toBe("lazy"); expect(image.getAttribute("decoding")).toBe("async");
    fireEvent.error(image);
  }
  expect(screen.queryByRole("img")).toBeNull(); expect(screen.getByText("Фото пока не подготовлено")).toBeTruthy();
});

it("uses factual fallback and preserves safe description and source-search normalization", () => {
  const board = fixture(1);
  expect(toPublicCatalogItems([board])[0].canonicalSpecs.descriptionShort).toBe(
    "Beta board-001.");
  board.canonicalSpecs.descriptionShort = "  Сохранённый текст.  ";
  const [dto] = toPublicCatalogItems([board]);
  expect(dto.canonicalSpecs.descriptionShort).toBe("Сохранённый текст.");
  for (const query of ["Beta", "board_001", "BETA BOARD", "missing", "  "])
    expect(ui.matchesCanonicalCatalogSearch(dto, query)).toBe(ui.matchesCanonicalCatalogSearch(board, query));
  expect(JSON.stringify(dto)).not.toMatch(/"sizes"|"offers"|sourceCheckedAt|dataStatus|sourceUrl/);
});
