import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  databaseConfigured: vi.fn(),
  getPublicCanonicalCatalogItems: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw Object.assign(new Error("not found"), { kind: "not-found" }); },
  permanentRedirect: (href: string) => {
    throw Object.assign(new Error(href), { kind: "redirect" });
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    void prefetch;
    return <a href={href} {...props}>{children}</a>;
  },
}));
vi.mock("@/lib/database/config", () => ({ базаНастроена: mocks.databaseConfigured }));
vi.mock("@/lib/public-catalog-cache", () => ({
  getPublicCanonicalCatalogItems: mocks.getPublicCanonicalCatalogItems,
}));

import ModelsDirectoryPage, { generateMetadata } from "@/app/catalog/models/page";

const corpus = Array.from({ length: 558 }, (_, index) => ({
  slug: `board-${String(index + 1).padStart(3, "0")}`,
  brand: `Brand ${Math.floor(index / 17)}`,
  modelName: `Model ${index % 17}`,
  seasonLabel: index % 2 === 0 ? "2025/2026" : "2026/2027",
}));

describe("crawlable canonical model directory route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.databaseConfigured.mockReturnValue(true);
    mocks.getPublicCanonicalCatalogItems.mockResolvedValue(corpus);
  });

  it("waits for connection before loading data and renders 24 canonical model links", async () => {
    const order: string[] = [];
    mocks.connection.mockImplementation(async () => { order.push("connection"); });
    mocks.getPublicCanonicalCatalogItems.mockImplementation(async () => {
      order.push("loader");
      return corpus;
    });

    const page = await ModelsDirectoryPage({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);

    expect(order).toEqual(["connection", "loader"]);
    expect(markup.match(/href="\/boards\//g)).toHaveLength(24);
    expect(markup).toContain("Модели 1–24 из 558");
    expect(markup).toContain('href="/catalog/models?page=2"');
    expect(markup).toContain('href="/catalog/models?page=24"');
    expect(markup.match(/aria-label="Страница \d+"/g)).toHaveLength(24);
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain("priceFrom");
    expect(mocks.getPublicCanonicalCatalogItems).toHaveBeenCalledTimes(1);
  });

  it("renders the final six entries without losing their season identity", async () => {
    const page = await ModelsDirectoryPage({
      searchParams: Promise.resolve({ page: "24" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup.match(/href="\/boards\//g)).toHaveLength(6);
    expect(markup).toContain("Модели 553–558 из 558");
    expect(markup).toContain("2025/2026");
    expect(markup).toContain('href="/catalog/models?page=23"');
    expect(markup).not.toContain('rel="next"');
  });

  it("redirects page one to its single canonical URL", async () => {
    await expect(ModelsDirectoryPage({
      searchParams: Promise.resolve({ page: "1" }),
    })).rejects.toMatchObject({ kind: "redirect", message: "/catalog/models" });
    expect(mocks.getPublicCanonicalCatalogItems).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "01", "2,3", "9007199254740992"])(
    "rejects malformed page parameter %s without loading the catalog",
    async (page) => {
      const value = page === "2,3" ? ["2", "3"] : page;
      await expect(ModelsDirectoryPage({
        searchParams: Promise.resolve({ page: value }),
      })).rejects.toMatchObject({ kind: "not-found" });
      expect(mocks.getPublicCanonicalCatalogItems).not.toHaveBeenCalled();
    },
  );

  it("checks a syntactically valid out-of-range page only after a successful load", async () => {
    await expect(ModelsDirectoryPage({
      searchParams: Promise.resolve({ page: "25" }),
    })).rejects.toMatchObject({ kind: "not-found" });
    expect(mocks.getPublicCanonicalCatalogItems).toHaveBeenCalledTimes(1);
  });

  it("fails closed when database configuration is missing", async () => {
    mocks.databaseConfigured.mockReturnValue(false);
    await expect(ModelsDirectoryPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("Public model directory is unavailable");
    expect(mocks.getPublicCanonicalCatalogItems).not.toHaveBeenCalled();
  });

  it("propagates loader failures instead of returning an empty directory", async () => {
    mocks.getPublicCanonicalCatalogItems.mockRejectedValue(new Error("catalog unavailable"));
    await expect(ModelsDirectoryPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("catalog unavailable");
  });

  it("uses a self-canonical URL for each valid page and omits canonicals for malformed input", async () => {
    await expect(generateMetadata({ searchParams: Promise.resolve({}) })).resolves.toMatchObject({
      alternates: { canonical: "/catalog/models" },
    });
    await expect(generateMetadata({ searchParams: Promise.resolve({ page: "2" }) })).resolves.toMatchObject({
      alternates: { canonical: "/catalog/models?page=2" },
    });
    await expect(generateMetadata({ searchParams: Promise.resolve({ page: "1" }) })).resolves.toMatchObject({
      alternates: { canonical: "/catalog/models" },
    });
    await expect(generateMetadata({ searchParams: Promise.resolve({ page: "invalid" }) })).resolves.not.toHaveProperty("alternates");
  });
});
