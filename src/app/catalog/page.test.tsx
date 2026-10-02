import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicCanonicalCatalogItems: vi.fn(),
  getAllCanonicalCatalogItems: vi.fn(),
}));

vi.mock("@/lib/public-catalog-cache", () => ({
  getPublicCanonicalCatalogItems: mocks.getPublicCanonicalCatalogItems,
}));

vi.mock("@/lib/canonical-catalog", () => ({
  getAllCanonicalCatalogItems: mocks.getAllCanonicalCatalogItems,
}));

vi.mock("@/components/catalog/catalog-view", () => ({
  CatalogView: ({ boards }: { boards: unknown[] }) => (
    <div data-catalog-board-count={boards.length} />
  ),
}));

import CatalogPage, { revalidate } from "@/app/catalog/page";

describe("public catalog page data source", () => {
  it("revalidates the route and reads through the public cache wrapper", async () => {
    mocks.getPublicCanonicalCatalogItems.mockResolvedValue([]);

    const page = await CatalogPage();
    const markup = renderToStaticMarkup(page);

    expect(revalidate).toBe(300);
    expect(mocks.getPublicCanonicalCatalogItems).toHaveBeenCalledTimes(1);
    expect(mocks.getAllCanonicalCatalogItems).not.toHaveBeenCalled();
    expect(markup).toContain('data-catalog-board-count="0"');
  });
});
