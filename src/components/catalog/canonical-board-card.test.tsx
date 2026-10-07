import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";
import { toPublicCatalogItem } from "@/lib/public-catalog-dto";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: React.ComponentProps<"a"> & {
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));

vi.mock("@/components/analytics/tracked-store-link", () => ({
  TrackedStoreLink: ({
    analyticsPayload,
    children,
    ...props
  }: React.ComponentProps<"a"> & {
    analyticsPayload?: Record<string, unknown>;
  }) => (
    <a
      {...props}
      data-analytics={
        analyticsPayload ? JSON.stringify(analyticsPayload) : undefined
      }
    >
      {children}
    </a>
  ),
}));

import { CanonicalBoardCard } from "@/components/catalog/canonical-board-card";

const board: CanonicalCatalogItem = {
  familyId: null,
  slug: "brand-model",
  brand: "Brand",
  modelName: "Model",
  seasonLabel: "2026/2027",
  canonicalSpecs: {
    descriptionShort: "Описание модели",
    descriptionFull: "Полное описание модели",
    ridingStyle: "all-mountain",
    skillLevel: "intermediate",
    flex: 5,
    boardLine: "unisex",
    shapeType: "directional-twin",
    camberProfile: "hybrid-camber",
    dataStatus: "verified",
    canonicalSourceKind: "trusted-member",
    sourceName: "Store",
    sourceUrl: "https://example.com/model",
    sourceCheckedAt: "2026-08-01T00:00:00.000Z",
  },
  offers: [
    {
      offerId: "offer-1",
      offerSlug: "brand-model",
      memberRole: null,
      familyMatchMethod: null,
      familyMatchConfidence: null,
      familyManualOverride: false,
      priceFrom: 60_000,
      isActive: true,
      hasAvailableSize: true,
      isFulfillable: true,
      sourceName: "Store",
      sourceUrl: "https://example.com/model",
      sourceCheckedAt: "2026-08-01T00:00:00.000Z",
      dataStatus: "verified",
    },
  ],
  sizes: [],
  priceFrom: 60_000,
  isActive: true,
  hasAvailableSize: true,
  media: [],
  defaultOfferSlug: "brand-model",
};

describe("CanonicalBoardCard route prefetch", () => {
  it("does not truncate the legacy availability disclaimer", () => {
    const css = readFileSync("src/components/boards/board-card.module.css", "utf8");
    const rule = css.match(/\.availability span\s*\{([^}]+)\}/u)?.[1];
    expect(rule).toBeDefined();
    expect(rule).not.toMatch(/line-clamp|overflow:\s*hidden/u);
  });
  it.each([true, false])("distinguishes stored marks and price from current stock (marks=%s)", (marked) => {
    const fixture = { ...toPublicCatalogItem(board), priceFrom: marked ? 41_745 : null,
      availableSizeCount: marked ? 3 : 0,
      availabilityPreview: marked ? "Ранее отмеченные размеры: 156W, 159, 159W. Проверь наличие у продавца." : "Проверь наличие в магазине." };
    const markup = renderToStaticMarkup(<CanonicalBoardCard board={fixture} />);
    expect(markup).toContain("Сохранённая цена от");
    expect(markup).toContain(marked ? "41 745 ₽" : "нет данных");
    expect(markup).toContain(marked ? "Ранее отмечено: 3 размера" : "Доступность не подтверждена");
    expect(markup).toContain("Проверить в магазине");
    expect(markup).toContain("/go/brand-model?");
    expect(markup).not.toMatch(/В наличии|в наличии сейчас|Есть отметки в каталоге/u);
  });
  it("renders byte-identical card markup from compact and canonical data", () => {
    const fixture = { ...board, media: ["/one.svg", "/two.svg", "/three.svg"] };
    expect(renderToStaticMarkup(<CanonicalBoardCard board={toPublicCatalogItem(fixture)} />))
      .toBe(renderToStaticMarkup(<CanonicalBoardCard board={fixture} />));
  });
  it("disables prefetch on all three board links without changing the store action", () => {
    const markup = renderToStaticMarkup(<CanonicalBoardCard board={board} />);
    const boardLinks = Array.from(
      markup.matchAll(/<a\b[^>]*href="\/boards\/brand-model"[^>]*>/g),
      ([link]) => link,
    );

    expect(boardLinks).toHaveLength(3);
    expect(boardLinks.every((link) => link.includes('data-prefetch="false"'))).toBe(
      true,
    );
    expect(markup).toContain("/go/brand-model");
    expect(markup).toContain("data-analytics");
    expect(markup).toContain("catalog");
  });
});
