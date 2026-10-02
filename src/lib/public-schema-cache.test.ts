import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  address: "postgres://fixture-one", ssl: "require", read: vi.fn(),
  entries: new Map<string, unknown>(),
}));
vi.mock("@/lib/database/config", () => ({
  получитьАдресБазы: () => mocks.address, получитьРежимSsl: () => mocks.ssl,
}));
vi.mock("@/lib/database/client", () => ({ получитьКлиентБазы: () => "fake-client" }));
vi.mock("@/lib/database/product-column-support", () => ({ readProductColumnSupport: mocks.read }));
vi.mock("next/cache", () => ({
  unstable_cache: (operation: (...args: unknown[]) => Promise<unknown>, keys: string[], options: { revalidate: number }) => {
    if (options.revalidate !== 3600) throw new Error("Unexpected schema TTL");
    return async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      if (mocks.entries.has(key)) return mocks.entries.get(key);
      const result = await operation(...args);
      mocks.entries.set(key, result);
      return result;
    };
  },
}));
import { getPublicDatabaseNamespace, getPublicSchemaSupport } from "./public-schema-cache";

beforeEach(() => {
  mocks.entries.clear(); mocks.read.mockReset();
  mocks.address = "postgres://fixture-one"; mocks.ssl = "require";
});
describe("public schema capability cache", () => {
  it("reuses one real read in an hour, rereads at bucket rollover, and isolates configuration", async () => {
    mocks.read.mockResolvedValue({ modelFamilies: true });
    const firstNamespace = getPublicDatabaseNamespace();
    await getPublicSchemaSupport(firstNamespace, 3_600_000);
    await getPublicSchemaSupport(firstNamespace, 7_199_999);
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await getPublicSchemaSupport(firstNamespace, 7_200_000);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    mocks.address = "postgres://fixture-two";
    const secondNamespace = getPublicDatabaseNamespace();
    expect(secondNamespace).not.toBe(firstNamespace);
    expect(secondNamespace).not.toContain("postgres");
    await getPublicSchemaSupport(secondNamespace, 7_200_000);
    expect(mocks.read).toHaveBeenCalledTimes(3);
    mocks.ssl = "disable";
    expect(getPublicDatabaseNamespace()).not.toBe(secondNamespace);
  });

  it("does not cache read failures, invent support, or log configuration", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.read.mockRejectedValueOnce(new Error("fixture schema unavailable"))
      .mockResolvedValue({ modelFamilies: false });
    const namespace = getPublicDatabaseNamespace();
    await expect(getPublicSchemaSupport(namespace, 0)).rejects.toThrow("unavailable");
    await expect(getPublicSchemaSupport(namespace, 0)).resolves.toEqual({ modelFamilies: false });
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain(namespace);
    expect(JSON.stringify(log.mock.calls)).not.toContain(mocks.address);
    log.mockRestore();
  });
});
