import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalBoardRouteResolution } from "@/lib/canonical-catalog";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (operation: unknown) => operation }));
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(), sql: vi.fn(), configured: true, namespace: "one", schema: vi.fn(),
  time: 0, entries: new Map<string, { value: unknown; expires: number }>(),
  cacheOptions: [] as { revalidate: number; tags: string[] }[],
}));
vi.mock("@/lib/canonical-catalog", () => ({ loadPublicCanonicalBoard: mocks.resolve }));
vi.mock("@/lib/canonical-board-detail", () => ({ getCanonicalNarrativeOfferSlug: () => "narrative-offer" }));
vi.mock("@/lib/database/client", () => ({ получитьКлиентБазы: () => mocks.sql }));
vi.mock("@/lib/database/config", () => ({ базаНастроена: () => mocks.configured }));
vi.mock("@/lib/public-schema-cache", () => ({
  getPublicDatabaseNamespace: () => mocks.namespace, getPublicSchemaSupport: mocks.schema,
}));
vi.mock("next/cache", () => ({
  unstable_cache: (operation: (...args: unknown[]) => Promise<unknown>, keys: string[], options: { revalidate: number; tags: string[] }) => {
    mocks.cacheOptions.push(options);
    return async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      const entry = mocks.entries.get(key);
      if (entry && entry.expires > mocks.time) return entry.value;
      const value = await operation(...args);
      mocks.entries.set(key, { value, expires: mocks.time + options.revalidate * 1000 });
      return value;
    };
  },
}));
import { getPublicBoardBundle, loadPublicBoardNarrative } from "./public-board-cache";
const resolution = { kind: "render", item: { slug: "board" } } as CanonicalBoardRouteResolution;
beforeEach(() => {
  mocks.entries.clear(); mocks.resolve.mockReset(); mocks.sql.mockReset(); mocks.schema.mockReset();
  mocks.schema.mockResolvedValue({ modelFamilies: true });
  mocks.resolve.mockResolvedValue(resolution);
  mocks.sql.mockResolvedValue([{ scenarios: ["scenario"], notIdealFor: ["not ideal"] }]);
  mocks.time = 0; mocks.namespace = "one"; mocks.configured = true;
});
describe("public board data cache", () => {
  it("caches canonical resolution and narrow narrative, expires, and isolates slugs/configuration", async () => {
    expect(mocks.cacheOptions).toEqual([{ revalidate: 3600, tags: ["edgefit-public-canonical-catalog"] }]);
    const first = await getPublicBoardBundle("board");
    expect(await getPublicBoardBundle("board")).toEqual(first);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
    expect(mocks.schema).toHaveBeenCalledTimes(2); // outside the data cache
    expect(first?.narrative).toEqual({ scenarios: ["scenario"], notIdealFor: ["not ideal"] });
    mocks.time = 3_600_001;
    await getPublicBoardBundle("board");
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    await getPublicBoardBundle("another");
    mocks.namespace = "two";
    await getPublicBoardBundle("board");
    expect(mocks.resolve).toHaveBeenCalledTimes(4);
    const query = mocks.sql.mock.calls[0][0].join(" ");
    expect(query).toContain("p.is_active = true");
    expect(query).not.toMatch(/product_sizes|json_agg|description_|price_from/);
  });

  it("does not persist unresolved or failed lookups and recovers", async () => {
    mocks.resolve.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("database unavailable"));
    await expect(getPublicBoardBundle("board")).resolves.toBeUndefined();
    await expect(getPublicBoardBundle("board")).rejects.toThrow("database unavailable");
    await expect(getPublicBoardBundle("board")).resolves.toMatchObject({ resolution });
    expect(mocks.resolve).toHaveBeenCalledTimes(3);
  });

  it("preserves redirects without fetching narrative, and preserves array normalization", async () => {
    mocks.resolve.mockResolvedValue({ ...resolution, kind: "redirect", canonicalSlug: "board" });
    expect((await getPublicBoardBundle("alias"))?.resolution.kind).toBe("redirect");
    expect(mocks.sql).not.toHaveBeenCalled();
    mocks.sql.mockResolvedValue([{ scenarios: "invalid", notIdealFor: null }]);
    expect(await loadPublicBoardNarrative("narrative-offer")).toEqual({ scenarios: [], notIdealFor: [] });
    mocks.sql.mockResolvedValue([]);
    expect(await loadPublicBoardNarrative("missing")).toEqual({ scenarios: [], notIdealFor: [] });
  });

  it("does not read the database when safely disabled", async () => {
    mocks.configured = false;
    expect(await getPublicBoardBundle("board")).toBeUndefined();
    expect(mocks.schema).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
