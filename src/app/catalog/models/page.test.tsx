import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  loadCatalog: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/lib/public-catalog-cache", () => ({ getPublicCanonicalCatalogItems: mocks.loadCatalog }));

import ModelsDirectoryPage, { metadata } from "./page";

it("links every canonical model in server HTML and identifies seasons without linking aliases", async () => {
  const models = Array.from({ length: 558 }, (_, index) => ({
    slug: `model-${index}`, brand: index < 300 ? "Бренд А" : "Бренд Б",
    modelName: `Model ${index}`, seasonLabel: "2025/2026",
  }));
  mocks.connection.mockResolvedValue(undefined);
  mocks.loadCatalog.mockResolvedValue([...models].reverse().concat(models[0], {
    ...models[0], slug: "nitro-team-2025-2026",
  }));
  const markup = renderToStaticMarkup(await ModelsDirectoryPage());
  const links = [...markup.matchAll(/href="\/boards\/([a-z0-9-]+)"/gu)].map(([, slug]) => slug);
  expect(links).toEqual(models.map(({ slug }) => slug));
  expect(markup).toContain("Model 557 · 2025/2026");
  expect(markup).toContain('href="/catalog"');
  expect(metadata.alternates?.canonical).toBe("/catalog/models");
});

it("propagates unavailable catalog data instead of rendering an empty directory", async () => {
  mocks.loadCatalog.mockRejectedValueOnce(new Error("Catalog unavailable"));
  await expect(ModelsDirectoryPage()).rejects.toThrow("Catalog unavailable");
});
