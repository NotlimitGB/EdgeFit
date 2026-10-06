import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicCanonicalCatalogItems: vi.fn(),
  getAllCanonicalCatalogItems: vi.fn(),
  connection: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));

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

import CatalogPage from "@/app/catalog/page";

describe("public catalog page data source", () => {
  it("waits for a request before reading unchanged runtime data", async () => {
    let release!: () => void;
    mocks.connection.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    const boards = [{ slug: "runtime-board" }];
    mocks.getPublicCanonicalCatalogItems.mockResolvedValue(boards);
    const pending = CatalogPage();
    expect(mocks.getPublicCanonicalCatalogItems).not.toHaveBeenCalled();
    release();

    const page = await pending;
    const markup = renderToStaticMarkup(page);

    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(page.props.children[1].props.children[1].props.boards).toBe(boards);
    expect(mocks.getPublicCanonicalCatalogItems).toHaveBeenCalledTimes(1);
    expect(mocks.getAllCanonicalCatalogItems).not.toHaveBeenCalled();
    expect(markup).toContain('data-catalog-board-count="1"');
  });
});
