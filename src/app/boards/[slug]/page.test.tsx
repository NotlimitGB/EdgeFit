import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalCatalogItem } from "@/types/canonical-catalog";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  getAllSlugs: vi.fn(),
  getAllItems: vi.fn(),
  getProduct: vi.fn(),
  runStage: vi.fn(
    async (_stage: string, operation: () => unknown | Promise<unknown>) =>
      operation(),
  ),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a href={String(href)} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  permanentRedirect: mocks.permanentRedirect,
}));
vi.mock("@/lib/canonical-catalog", () => ({
  getAllCanonicalBoardSlugs: mocks.getAllSlugs,
  getAllCanonicalCatalogItems: mocks.getAllItems,
  resolveCanonicalBoardRouteBySlug: mocks.resolve,
}));
vi.mock("@/lib/products", () => ({
  getProductBySlug: mocks.getProduct,
}));
vi.mock("@/lib/board-page-load-diagnostics", () => ({
  createBoardPageDiagnostics: () => ({
    traceId: "trace-board-page",
    runStage: mocks.runStage,
  }),
}));
vi.mock("@/components/analytics/tracked-store-link", () => ({
  TrackedStoreLink: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/components/boards/board-gallery", () => ({
  BoardGallery: () => <div data-gallery />,
}));

import BoardPage, { generateMetadata } from "@/app/boards/[slug]/page";

const board: CanonicalCatalogItem = {
  familyId: null,
  slug: "brand-model",
  brand: "Brand",
  modelName: "Model",
  seasonLabel: null,
  canonicalSpecs: {
    descriptionShort: "Описание модели",
    descriptionFull: "Описание модели",
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
      offerSlug: "brand-model-offer",
      memberRole: "base",
      familyMatchMethod: "source-id",
      familyMatchConfidence: "high",
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
  defaultOfferSlug: "brand-model-offer",
};

describe("canonical board metadata", () => {
  it.each([
    { seasonLabel: null, identity: "Brand Model" },
    { seasonLabel: "2025/2026", identity: "Brand Model 2025/2026" },
    { seasonLabel: "2026/2027", identity: "Brand Model 2026/2027" },
  ])("uses safe identity fields for season $seasonLabel", async ({ seasonLabel, identity }) => {
    const item: CanonicalCatalogItem = {
      ...board,
      seasonLabel,
      canonicalSpecs: {
        ...board.canonicalSpecs,
        descriptionShort: "Купить дешевле — лучший выбор магазина.",
        descriptionFull: "Свободный merchant-текст не должен попасть в metadata.",
      },
    };
    mocks.resolve.mockResolvedValue({ kind: "render", item });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: item.slug }),
    });
    const description = `${identity}: характеристики, ростовки и геометрия модели. Проверь подходящую ростовку и ширину по своим параметрам в EdgeFit.`;

    expect(metadata).toMatchObject({
      title: identity,
      description,
      alternates: { canonical: `/boards/${item.slug}` },
      openGraph: {
        title: identity,
        description,
        url: `/boards/${item.slug}`,
      },
    });
    expect(JSON.stringify(metadata)).not.toContain("Купить дешевле");
    expect(JSON.stringify(metadata)).not.toContain("merchant-текст");
    expect(metadata).not.toHaveProperty("twitter");
  });
});

describe("canonical board page loading", () => {
  it("keeps the primary board and narrative lookup without loading the full catalog", async () => {
    mocks.resolve.mockResolvedValue({ kind: "render", item: board });
    mocks.getProduct.mockResolvedValue(undefined);

    const page = await BoardPage({
      params: Promise.resolve({ slug: board.slug }),
    });
    const markup = renderToStaticMarkup(page);

    expect(mocks.resolve).toHaveBeenCalledWith(board.slug);
    expect(mocks.runStage).toHaveBeenCalledWith(
      "narrative_product_lookup",
      expect.any(Function),
    );
    expect(mocks.getProduct).toHaveBeenCalledWith("brand-model-offer");
    expect(mocks.getAllItems).not.toHaveBeenCalled();
    expect(markup).toContain("Brand");
    expect(markup).toContain("Model");
    expect(markup).toContain("Перед покупкой");
    expect(markup).toContain("Основные характеристики");
    expect(markup).toContain("Источник характеристик");
    expect(markup).toContain("Данные обновлены:");
    expect(markup).not.toContain("Доверие к данным");
    expect(markup).toMatch(
      /<a\b[^>]*href="\/catalog"[^>]*data-prefetch="false"[^>]*>/,
    );
    expect(markup).not.toContain("Похожие модели");
    expect(markup).not.toContain("Что ещё стоит сравнить");
    expect(markup.match(/href="\/quiz\?board=brand-model"/gu)).toHaveLength(2);
  });
});
