// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";
import { toPublicCatalogItem } from "@/lib/public-catalog-dto";
import type {
  BoardShape,
  Product,
  RidingStyle,
  SkillLevel,
  WidthType,
} from "@/types/domain";

const navigation = vi.hoisted(() => ({
  currentSearch: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/catalog",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.currentSearch),
}));

vi.mock("@/components/catalog/canonical-board-card", () => ({
  CanonicalBoardCard: ({ board }: { board: CanonicalCatalogItem }) => (
    <article data-testid={`board-${board.slug}`}>{board.modelName}</article>
  ),
}));

import { CatalogView } from "./catalog-view";
import { getCatalogStateKey, parseCatalogState } from "./catalog-state";
import { catalogFacets } from "./catalog-selection";

interface BoardFixtureOptions {
  slug: string;
  brand: string;
  modelName: string;
  ridingStyle: RidingStyle;
  skillLevel: SkillLevel;
  boardLine: Product["boardLine"];
  shapeType: BoardShape;
  widthType: WidthType;
  priceFrom: number;
}

function createBoard({
  slug,
  brand,
  modelName,
  ridingStyle,
  skillLevel,
  boardLine,
  shapeType,
  widthType,
  priceFrom,
}: BoardFixtureOptions): CanonicalCatalogItem {
  return {
    familyId: null,
    slug,
    brand,
    modelName,
    seasonLabel: "2026/2027",
    canonicalSpecs: {
      descriptionShort: `${modelName} description`,
      descriptionFull: `${modelName} full description`,
      ridingStyle,
      skillLevel,
      flex: 5,
      boardLine,
      shapeType,
      camberProfile: "camber",
      dataStatus: "verified",
      canonicalSourceKind: "trusted-member",
      sourceName: "Test Store",
      sourceUrl: `https://example.com/${slug}`,
      sourceCheckedAt: "2026-08-01T00:00:00.000Z",
    },
    offers: [],
    sizes: [
      {
        sourceSizeId: `${slug}-size`,
        offerId: `${slug}-offer`,
        offerSlug: slug,
        memberRole: null,
        offerIsActive: true,
        rawSizeLabel: "156",
        displaySizeLabel: "156",
        sizeLabel: "156",
        sizeCm: 156,
        waistWidthMm: 252,
        recommendedWeightMin: 60,
        recommendedWeightMax: 85,
        widthType,
        isAvailable: true,
      },
    ],
    priceFrom,
    isActive: true,
    hasAvailableSize: true,
    media: [],
    defaultOfferSlug: slug,
  };
}

const boards = [
  createBoard({
    slug: "all-mountain-board",
    brand: "Alpha",
    modelName: "All Mountain Board",
    ridingStyle: "all-mountain",
    skillLevel: "beginner",
    boardLine: "men",
    shapeType: "directional",
    widthType: "regular",
    priceFrom: 30_000,
  }),
  createBoard({
    slug: "park-board",
    brand: "Beta",
    modelName: "Park Board",
    ridingStyle: "park",
    skillLevel: "intermediate",
    boardLine: "women",
    shapeType: "twin",
    widthType: "wide",
    priceFrom: 20_000,
  }),
  createBoard({
    slug: "freeride-board",
    brand: "Alpha",
    modelName: "Freeride Board",
    ridingStyle: "freeride",
    skillLevel: "advanced",
    boardLine: "unisex",
    shapeType: "directional-twin",
    widthType: "mid-wide",
    priceFrom: 40_000,
  }),
].map(toPublicCatalogItem);

// The redesign replaces floating multi-select menus/router.replace with inline
// facets, a modal draft and native history. Keep domain fixture coverage above.
beforeEach(() => {
  navigation.currentSearch = "";
  window.history.replaceState(null, "", "/catalog");
  window.sessionStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const titles = () => screen.queryAllByRole("article").map((node) => node.textContent);
function renderCatalog(search = "", input = boards) {
  navigation.currentSearch = search;
  window.history.replaceState(null, "", `/catalog${search ? `?${search}` : ""}`);
  return render(<CatalogView boards={input} initialSearch={search} />);
}
function facet(label: string) { fireEvent.click(screen.getByRole("checkbox", { name: label })); }
const storageKey = "edgefit:catalog-visible-count:v2";
function restorationCorpus(count: number) {
  return Array.from({ length: count }, (_, i) => ({ ...boards[0],
    slug: `returning-${String(i).padStart(3, "0")}`,
    modelName: `Returning ${String(i).padStart(3, "0")}`,
    searchText: `alpha returning ${String(i).padStart(3, "0")}`,
    priceFrom: i + 1,
  }));
}
function identities() {
  return Array.from(document.querySelectorAll("article"), (node) => node.getAttribute("data-testid")?.slice("board-".length));
}
function saveExpansion(input: typeof boards, count: unknown, search = "") {
  const facets = catalogFacets(input);
  const stateKey = getCatalogStateKey(parseCatalogState(new URLSearchParams(search), facets.brands, facets));
  sessionStorage.setItem(storageKey, JSON.stringify({ stateKey, visibleCount: count }));
}

describe("catalog applied state and local interactions", () => {
  it("server-renders 24 of 558 and applies URL filters before hydration", () => {
    const corpus = Array.from({ length: 558 }, (_, i) => ({ ...boards[i % 3], slug: `board-${i}`, modelName: `Model ${i}` }));
    const html = renderToStaticMarkup(<CatalogView boards={corpus} />);
    expect((html.match(/<article/g) ?? [])).toHaveLength(24);
    expect(html).toContain("558");
    const filtered = renderToStaticMarkup(<CatalogView boards={boards} initialSearch="line=women" />);
    expect((filtered.match(/<article/g) ?? [])).toHaveLength(1);
    expect(filtered).toContain("Park Board"); expect(filtered).not.toContain("board-all-mountain-board");
  });
  it("ORs brands and styles, ANDs categories, normalizes brands and keeps foreign params", () => {
    renderCatalog("utm_source=test");
    facet("Alpha"); expect(titles()).toEqual(["All Mountain Board", "Freeride Board"]);
    facet("Beta"); expect(titles()).toHaveLength(3);
    facet("freeride / powder"); expect(titles()).toEqual(["Freeride Board"]);
    expect(location.search).toContain("brand=Alpha&brand=Beta");
    expect(location.search).toContain("utm_source=test");
    fireEvent.click(screen.getByRole("button", { name: "Убрать бренд: Beta" }));
    expect(location.search).not.toContain("brand=Beta");
  });
  it("searches all data with rapid edits, clears independently and uses native history only", async () => {
    const replace = vi.spyOn(window.history, "replaceState");
    renderCatalog();
    fireEvent.change(screen.getByLabelText("Поиск по каталогу"), { target: { value: "freeride" } });
    fireEvent.change(screen.getByLabelText("Поиск по каталогу"), { target: { value: "park" } });
    expect(titles()).toEqual(["Park Board"]);
    await waitFor(() => expect(location.search).toBe("?q=park"));
    expect(replace).toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Поиск: park" }));
    expect(titles()).toHaveLength(3);
  });
  it("keeps sorting and width filtering, resets filters without resetting sort", () => {
    renderCatalog();
    fireEvent.change(screen.getByLabelText("Сортировка"), { target: { value: "price-desc" } });
    expect(titles()).toEqual(["Freeride Board", "All Mountain Board", "Park Board"]);
    facet("wide"); expect(titles()).toEqual(["Park Board"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Сбросить фильтры" })[0]);
    expect(titles()).toHaveLength(3); expect(location.search).toBe("?sort=price-desc");
    fireEvent.click(screen.getByRole("button", { name: "Восстановить исходный вид" })); expect(location.search).toBe("");
  });
  it("restores external URLs and closes an unapplied draft", async () => {
    renderCatalog();
    fireEvent.click(screen.getByRole("button", { name: "Фильтры" }));
    window.history.pushState(null, "", "/catalog?line=women");
    fireEvent(window, new PopStateEvent("popstate"));
    await waitFor(() => expect(titles()).toEqual(["Park Board"]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("draft is isolated, cancel discards, apply is atomic and focus returns", () => {
    renderCatalog(); const trigger = screen.getByRole("button", { name: "Фильтры" });
    fireEvent.click(trigger);
    const modal = screen.getByRole("dialog");
    fireEvent.click(within(modal).getByRole("checkbox", { name: "Женская" }));
    expect(titles()).toHaveLength(3); expect(location.search).toBe("");
    expect(within(modal).getByRole("button", { name: "Показать 1 модель" })).toBeTruthy();
    fireEvent(modal, new Event("cancel", { cancelable: true }));
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect((within(screen.getByRole("dialog")).getByRole("checkbox", { name: "Женская" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: "Женская" }));
    fireEvent.click(screen.getByRole("button", { name: "Показать 1 модель" }));
    expect(titles()).toEqual(["Park Board"]); expect(location.search).toBe("?line=women");
  });
  it("loads 24 at a time without duplicates and restores count on return", async () => {
    const corpus = Array.from({ length: 60 }, (_, i) => ({ ...boards[0], slug: `model-${i}`, modelName: `Model ${i}` }));
    const view = renderCatalog("", corpus);
    await waitFor(() => expect(titles()).toHaveLength(24));
    fireEvent.click(screen.getByRole("button", { name: "Показать ещё 24" }));
    expect(titles()).toHaveLength(48); expect(new Set(titles()).size).toBe(48);
    view.unmount(); renderCatalog("", corpus);
    await waitFor(() => expect(titles()).toHaveLength(48));
    fireEvent.click(screen.getByRole("button", { name: "Показать ещё 12" })); expect(titles()).toHaveLength(60);
  });
  it("storage failures do not prevent filtering and distinguishes genuine empty corpus", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const view = renderCatalog(); facet("Beta"); expect(titles()).toEqual(["Park Board"]);
    fireEvent.change(screen.getByLabelText("Поиск по каталогу"), { target: { value: "absent" } });
    expect(screen.getByText("По этим условиям моделей не найдено")).toBeTruthy();
    view.unmount(); renderCatalog("", []); expect(screen.getByText("В каталоге пока нет моделей")).toBeTruthy();
  });
  it.each([60, 558])("restores the complete final partial batch of %i identities after remount", async (total) => {
    const corpus = restorationCorpus(total);
    const view = renderCatalog("", corpus);
    await waitFor(() => expect(identities()).toHaveLength(24));
    for (let visible = 24; visible < total; visible += 24) {
      fireEvent.click(screen.getByRole("button", { name: `Показать ещё ${Math.min(24, total - visible)}` }));
    }
    const expected = corpus.map((board) => board.slug);
    expect(identities()).toEqual(expected);
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).visibleCount).toBe(total);
    view.unmount(); renderCatalog("", corpus);
    await waitFor(() => expect(identities()).toEqual(expected));
    expect(identities().at(-1)).toBe(corpus.at(-1)!.slug);
    expect(new Set(identities()).size).toBe(total);
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).visibleCount).toBe(total);
  });
  it.each([24, 25, 48, 49, 60, 73])("restores saved integer %i without batch rounding", async (count) => {
    const corpus = restorationCorpus(96);
    saveExpansion(corpus, count);
    renderCatalog("", corpus);
    expect(identities()).toEqual(corpus.slice(0, 24).map((board) => board.slug));
    await waitFor(() => expect(identities()).toEqual(corpus.slice(0, count).map((board) => board.slug)));
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).visibleCount).toBe(count);
  });
  it.each([null, "60", "invalid", 24.5, -24, 0, 23, Number.MAX_SAFE_INTEGER + 1])("ignores invalid saved count %s", async (count) => {
    const corpus = restorationCorpus(60);
    saveExpansion(corpus, count);
    renderCatalog("", corpus);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    await waitFor(() => expect(identities()).toHaveLength(24));
    await waitFor(() => expect(screen.getByText("Показано 24 из 60")).toBeTruthy());
  });
  it.each(["missing", "broken-json", "wrong-key", "read-failure"])("fails open for %s storage", async (mode) => {
    const corpus = restorationCorpus(60);
    if (mode === "broken-json") sessionStorage.setItem(storageKey, "{broken");
    if (mode === "wrong-key") sessionStorage.setItem(storageKey, JSON.stringify({ stateKey: "other", visibleCount: 60 }));
    if (mode === "read-failure") vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    renderCatalog("", corpus);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    await waitFor(() => expect(identities()).toEqual(corpus.slice(0, 24).map((board) => board.slug)));
  });
  it.each([0, 13, 49, 60])("clamps a large valid count to %i current results without phantom cards", async (total) => {
    const corpus = restorationCorpus(total);
    saveExpansion(corpus, Number.MAX_SAFE_INTEGER);
    renderCatalog("", corpus);
    await waitFor(() => expect(identities()).toEqual(corpus.map((board) => board.slug)));
    if (!total) expect(screen.getByText("В каталоге пока нет моделей")).toBeTruthy();
  });
  it.each(["q=returning", "brand=Alpha", "brand=Alpha&line=men&q=returning&sort=price-desc"])("restores only matching identities for %s and preserves URL state on Back", async (search) => {
    const matching = restorationCorpus(60);
    const excluded = boards[1];
    const corpus = [...matching, excluded];
    const expected = (search.includes("price-desc") ? [...matching].reverse() : matching).map((board) => board.slug);
    saveExpansion(corpus, 73, search);
    const view = renderCatalog(search, corpus);
    await waitFor(() => expect(identities()).toEqual(expected));
    expect(identities()).not.toContain(excluded.slug);
    view.unmount(); renderCatalog(search, corpus);
    await waitFor(() => expect(identities()).toEqual(expected));
    expect(location.search).toBe(`?${search}`);
    window.history.pushState(null, "", "/catalog?line=women");
    fireEvent(window, new PopStateEvent("popstate"));
    await waitFor(() => expect(identities()).toEqual([excluded.slug]));
    window.history.replaceState(null, "", `/catalog?${search}`);
    fireEvent(window, new PopStateEvent("popstate"));
    await waitFor(() => expect(identities()).toEqual(expected));
    expect(location.search).toBe(`?${search}`);
  });
  it("resets expansion when filters change instead of restoring another state's count", async () => {
    const corpus = restorationCorpus(60);
    saveExpansion(corpus, 60);
    renderCatalog("", corpus);
    await waitFor(() => expect(identities()).toHaveLength(60));
    fireEvent.change(screen.getByLabelText("Поиск по каталогу"), { target: { value: "Returning" } });
    await waitFor(() => expect(identities()).toHaveLength(24));
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).visibleCount).toBe(24);
  });
});
