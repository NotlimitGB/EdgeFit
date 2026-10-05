// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { StrictMode } from "react";
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

function renderCatalog() {
  const view = render(<CatalogView boards={boards} />);
  const summary = screen.getByText("Стиль, уровень и характеристики");
  if (!summary.closest("details")?.open) fireEvent.click(summary);
  return view;
}

function expectOnlyBoard(slug: string) {
  expect(screen.getByTestId(`board-${slug}`)).toBeTruthy();
  expect(screen.getAllByRole("article")).toHaveLength(1);
}

function lastReplacement() {
  const calls = navigation.replace.mock.calls;
  return calls.at(-1)?.[0] as string | undefined;
}

async function acknowledgeReplacement(
  view: ReturnType<typeof renderCatalog>,
) {
  const replacement = lastReplacement();
  navigation.currentSearch = replacement?.split("?")[1] ?? "";
  view.rerender(<CatalogView boards={boards} />);
  await waitFor(() => {
    expect(new URLSearchParams(navigation.currentSearch).toString()).toBe(
      navigation.currentSearch,
    );
  });
}

beforeEach(() => {
  navigation.currentSearch = "";
  navigation.replace.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("CatalogView multiselect interactions", () => {
  const brandCorpus = [
    { ...boards[0], slug: "capita-a", brand: "Capita", canonicalSpecs: { ...boards[0].canonicalSpecs, ridingStyle: "freeride" as const } },
    { ...boards[1], slug: "capita-b", brand: "CAPiTA", canonicalSpecs: { ...boards[1].canonicalSpecs, ridingStyle: "park" as const } },
    { ...boards[2], slug: "burton-c", brand: "Burton" },
    { ...boards[2], slug: "jones-d", brand: "Jones" },
  ];

  it("merges logical brands, ORs selections, ANDs style and counts one group", async () => {
    const user = userEvent.setup();
    const view = render(<CatalogView boards={brandCorpus} />);
    await user.click(screen.getByRole("button", { name: "Бренд Все бренды" }));
    expect(screen.getAllByRole("checkbox", { name: "CAPiTA" })).toHaveLength(1);
    expect(screen.queryByRole("checkbox", { name: "Capita" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "CAPiTA" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Бренд CAPiTA" })).toBeTruthy();
    navigation.currentSearch = "brand=CAPiTA";
    view.rerender(<CatalogView boards={brandCorpus} />);
    await user.click(screen.getByRole("checkbox", { name: "Burton" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Активных фильтров: 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Бренд Выбрано: 2" })).toBeTruthy();
    expect(lastReplacement()).toBe("/catalog?brand=Burton&brand=CAPiTA");
    navigation.currentSearch = "brand=Burton&brand=CAPiTA";
    view.rerender(<CatalogView boards={brandCorpus} />);
    await user.click(screen.getByText("Стиль, уровень и характеристики"));
    await user.click(screen.getByRole("button", { name: "Стиль Все стили" }));
    await user.click(screen.getByRole("checkbox", { name: "freeride / powder" }));
    expect(screen.getAllByRole("article").map((e) => e.dataset.testid).sort()).toEqual(["board-burton-c", "board-capita-a"]);
    expect(brandCorpus[0].brand).toBe("Capita");
  });

  it("restores legacy and repeated brand URLs, external history and reset", async () => {
    const user = userEvent.setup();
    navigation.currentSearch = "brand=Capita";
    const view = render(<CatalogView boards={brandCorpus} />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Бренд CAPiTA" })).toBeTruthy();
    navigation.currentSearch = "brand=Burton&brand=CAPiTA";
    view.rerender(<CatalogView boards={brandCorpus} />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    navigation.currentSearch = "brand=Burton";
    view.rerender(<CatalogView boards={brandCorpus} />);
    await waitFor(() => expectOnlyBoard("burton-c"));
    await user.click(screen.getByRole("button", { name: "Сбросить всё" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Бренд Все бренды" })).toBeTruthy();
    expect(lastReplacement()).toBe("/catalog");
  });

  it("deselects one brand, resets its group and restores focus on Escape", async () => {
    const user = userEvent.setup();
    navigation.currentSearch = "brand=Burton&brand=CAPiTA";
    const view = render(<CatalogView boards={brandCorpus} />);
    await user.click(await screen.findByRole("button", { name: "Бренд Выбрано: 2" }));
    await user.click(screen.getByRole("checkbox", { name: "Burton" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(lastReplacement()).toBe("/catalog?brand=CAPiTA");
    navigation.currentSearch = "brand=CAPiTA";
    view.rerender(<CatalogView boards={brandCorpus} />);
    await user.click(within(screen.getByRole("group", { name: "Бренд" })).getByRole("button"));
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(lastReplacement()).toBe("/catalog");
    const trigger = screen.getByRole("button", { name: "Бренд Все бренды" });
    if (trigger.getAttribute("aria-expanded") !== "true") await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
  it("discloses extra filters without hiding an active deep-linked selection", async () => {
    const user = userEvent.setup();
    const view = render(<CatalogView boards={boards} />);
    const summary = screen.getByText("Стиль, уровень и характеристики");
    expect(summary.closest("details")?.open).toBe(false);
    await user.click(summary);
    expect(summary.closest("details")?.open).toBe(true);
    expect(screen.getByRole("button", { name: "Стиль Все стили" })).toBeTruthy();
    view.unmount();
    navigation.currentSearch = "style=park";
    render(<CatalogView boards={boards} />);
    await waitFor(() => expect(screen.getByText("Стиль, уровень и характеристики").closest("details")?.open).toBe(true));
    expect(screen.getByRole("button", { name: "Стиль park / freestyle" })).toBeTruthy();
  });

  it("keeps manual disclosure open after deselecting the last secondary filter and reset", async () => {
    const user = userEvent.setup();
    render(<CatalogView boards={boards} />);
    const summary = screen.getByText("Стиль, уровень и характеристики");
    await user.click(summary);
    await user.click(screen.getByRole("button", { name: "Стиль Все стили" }));
    const checkbox = screen.getByRole("checkbox", { name: "park / freestyle" });
    await user.click(checkbox);
    await user.click(checkbox);
    await waitFor(() => expect(summary.closest("details")?.open).toBe(true));
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Сбросить всё" }));
    expect(summary.closest("details")?.open).toBe(true);
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(summary);
    await waitFor(() => expect(summary.closest("details")?.open).toBe(false));
  });

  it("preserves manual close across local rerenders but reveals active filters on external history", async () => {
    const user = userEvent.setup();
    navigation.currentSearch = "style=park";
    const view = render(<CatalogView boards={boards} />);
    const summary = screen.getByText("Стиль, уровень и характеристики");
    await waitFor(() => expect(summary.closest("details")?.open).toBe(true));
    await user.click(summary);
    await waitFor(() => expect(summary.closest("details")?.open).toBe(false));
    view.rerender(<CatalogView boards={boards} />);
    expect(summary.closest("details")?.open).toBe(false);
    navigation.currentSearch = "style=park&skill=advanced";
    view.rerender(<CatalogView boards={boards} />);
    await waitFor(() => expect(summary.closest("details")?.open).toBe(true));
  });

  it("selects style by clicking the public option label", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.click(screen.getByRole("button", { name: "Стиль Все стили" }));

    const parkCheckbox = screen.getByRole("checkbox", {
      name: "park / freestyle",
    }) as HTMLInputElement;
    const parkRow = parkCheckbox.closest("label");
    expect(parkRow).toBeTruthy();
    await user.click(within(parkRow!).getByText("park / freestyle"));

    expect(parkCheckbox.checked).toBe(true);
    expect(
      screen.getByRole("button", { name: "Стиль park / freestyle" }),
    ).toBeTruthy();
    expectOnlyBoard("park-board");
    expect(lastReplacement()).toBe("/catalog?style=park");
  });

  it.each([
    {
      trigger: "Уровень Любой уровень",
      option: "продвинутый",
      summary: "Уровень продвинутый",
      board: "freeride-board",
      query: "skill=advanced",
    },
    {
      trigger: "Линейка Любая линейка",
      option: "Женская",
      summary: "Линейка Женская",
      board: "park-board",
      query: "line=women",
    },
    {
      trigger: "Форма Любая форма",
      option: "направленный твин",
      summary: "Форма направленный твин",
      board: "freeride-board",
      query: "shape=directional-twin",
    },
  ])(
    "selects $option by clicking the option label",
    async ({ trigger, option, summary, board, query }) => {
      const user = userEvent.setup();
      renderCatalog();

      await user.click(screen.getByRole("button", { name: trigger }));
      const checkbox = screen.getByRole("checkbox", {
        name: option,
      }) as HTMLInputElement;
      await user.click(within(checkbox.closest("label")!).getByText(option));

      expect(checkbox.checked).toBe(true);
      expect(screen.getByRole("button", { name: summary })).toBeTruthy();
      expectOnlyBoard(board);
      expect(lastReplacement()).toBe(`/catalog?${query}`);
    },
  );

  it("opens, toggles, switches, closes outside, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    renderCatalog();
    const styleTrigger = screen.getByRole("button", {
      name: "Стиль Все стили",
    });
    const skillTrigger = screen.getByRole("button", {
      name: "Уровень Любой уровень",
    });

    await user.click(styleTrigger);
    expect(styleTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("#catalog-style-options")).toBeTruthy();

    await user.click(styleTrigger);
    expect(styleTrigger.getAttribute("aria-expanded")).toBe("false");

    await user.click(styleTrigger);
    await user.click(skillTrigger);
    expect(document.querySelector("#catalog-style-options")).toBeNull();
    expect(document.querySelector("#catalog-skill-options")).toBeTruthy();

    await user.click(document.body);
    expect(document.querySelector("#catalog-skill-options")).toBeNull();

    await user.click(styleTrigger);
    await user.keyboard("{Escape}");
    expect(document.querySelector("#catalog-style-options")).toBeNull();
    expect(document.activeElement).toBe(styleTrigger);
  });

  it("keeps multiple styles selected and deselects only the clicked value", async () => {
    const user = userEvent.setup();
    const view = renderCatalog();
    const styleTrigger = screen.getByRole("button", {
      name: "Стиль Все стили",
    });

    await user.click(styleTrigger);
    await user.click(screen.getByText("park / freestyle"));
    await acknowledgeReplacement(view);
    await user.click(screen.getByText("all-mountain"));

    expect(
      (screen.getByRole("checkbox", {
        name: "all-mountain",
      }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", {
        name: "park / freestyle",
      }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Стиль Выбрано: 2" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(lastReplacement()).toBe(
      "/catalog?style=all-mountain&style=park",
    );

    await acknowledgeReplacement(view);
    await user.click(screen.getByText("park / freestyle"));

    expect(
      (screen.getByRole("checkbox", {
        name: "all-mountain",
      }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", {
        name: "park / freestyle",
      }) as HTMLInputElement).checked,
    ).toBe(false);
    expectOnlyBoard("all-mountain-board");
    expect(lastReplacement()).toBe("/catalog?style=all-mountain");
  });

  it("synchronizes external URL snapshots for refresh and back-forward navigation", async () => {
    navigation.currentSearch = "style=park";
    const view = renderCatalog();

    await waitFor(() => expect(
      screen.getByRole("button", { name: "Стиль park / freestyle" }),
    ).toBeTruthy());
    expectOnlyBoard("park-board");

    navigation.currentSearch = "style=all-mountain";
    view.rerender(<CatalogView boards={boards} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Стиль all-mountain" }),
      ).toBeTruthy();
    });
    expectOnlyBoard("all-mountain-board");
  });
});

describe("CatalogView unaffected catalog controls", () => {
  it("restores secondary disclosure after StrictMode effect replay", async () => {
    navigation.currentSearch = "style=park";
    const view = render(<StrictMode><CatalogView boards={boards} /></StrictMode>);
    await waitFor(() => expect(view.container.querySelector("details")?.open).toBe(true));
    expectOnlyBoard("park-board");
  });
  it("server-renders controls, total count and first 24 cards independently of URL hydration", () => {
    const corpus = Array.from({ length: 30 }, (_, id) => ({ ...boards[0], slug: `board-${id}` }));
    const markup = renderToStaticMarkup(<CatalogView boards={corpus} />);
    expect(markup.match(/<article /g)).toHaveLength(24);
    expect(markup).toContain("Поиск по каталогу");
    expect(markup).toContain("30");
    expect(markup).toContain("Показать ещё");
  });

  it("preserves load more and session restoration with the compact payload", async () => {
    const user = userEvent.setup();
    const corpus = Array.from({ length: 60 }, (_, id) => ({ ...boards[0], slug: `board-${id}` }));
    const view = render(<CatalogView boards={corpus} />);
    expect(screen.getAllByRole("article")).toHaveLength(24);
    await user.click(screen.getByRole("button", { name: "Показать ещё 24" }));
    expect(screen.getAllByRole("article")).toHaveLength(48);
    view.unmount();
    render(<CatalogView boards={corpus} />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(48));
  });
  it("keeps search working", () => {
    renderCatalog();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Поиск по каталогу" }),
      { target: { value: "Park" } },
    );
    expectOnlyBoard("park-board");
    expect(lastReplacement()).toBe("/catalog?q=Park");
  });

  it("keeps the brand checkbox working", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.click(screen.getByRole("button", { name: "Бренд Все бренды" }));
    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(lastReplacement()).toBe("/catalog?brand=Alpha");
  });

  it("keeps sorting working", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Сортировка" }),
      "price-desc",
    );
    expect(screen.getAllByRole("article").map((item) => item.textContent)).toEqual(
      ["Freeride Board", "All Mountain Board", "Park Board"],
    );
    expect(lastReplacement()).toBe("/catalog?sort=price-desc");
  });

  it("keeps width filtering working", async () => {
    const user = userEvent.setup();
    renderCatalog();

    const wideButton = screen.getByRole("button", { name: "wide" });
    await user.click(wideButton);
    expect(wideButton.getAttribute("aria-pressed")).toBe("true");
    expectOnlyBoard("park-board");
    expect(lastReplacement()).toBe("/catalog?width=wide");
  });

  it("keeps reset working", async () => {
    const user = userEvent.setup();
    navigation.currentSearch = "style=park";
    renderCatalog();

    await user.click(await screen.findByRole("button", { name: "Сбросить всё" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(lastReplacement()).toBe("/catalog");
    expect(screen.queryByRole("button", { name: "Сбросить всё" })).toBeNull();
  });
});
