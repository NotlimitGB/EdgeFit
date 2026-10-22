// @vitest-environment jsdom

import {
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
});
