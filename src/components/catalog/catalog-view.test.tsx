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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";
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
];

function renderCatalog() {
  return render(<CatalogView boards={boards} />);
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

    expect(
      screen.getByRole("button", { name: "Стиль park / freestyle" }),
    ).toBeTruthy();
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
  it("keeps search working", () => {
    renderCatalog();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Поиск по каталогу" }),
      { target: { value: "Park" } },
    );
    expectOnlyBoard("park-board");
    expect(lastReplacement()).toBe("/catalog?q=Park");
  });

  it("keeps the brand select working", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Бренд" }),
      "Alpha",
    );
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

    await user.click(screen.getByRole("button", { name: "Сбросить всё" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(lastReplacement()).toBe("/catalog");
    expect(screen.queryByRole("button", { name: "Сбросить всё" })).toBeNull();
  });
});
