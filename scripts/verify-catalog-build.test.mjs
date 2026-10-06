import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyCatalogBuild } from "./verify-catalog-build.mjs";

const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "snowdex-catalog-build-")); directories.push(root);
  for (const directory of [root, join(root, "standalone/.next")]) {
    mkdirSync(join(directory, "server/app/catalog"), { recursive: true });
    writeFileSync(join(directory, "server/app/catalog/page.js"), "module");
    writeFileSync(join(directory, "server/app-paths-manifest.json"), JSON.stringify({ "/catalog/page": "app/catalog/page.js" }));
  }
  writeFileSync(join(root, "standalone/server.js"), "server");
  writeFileSync(join(root, "prerender-manifest.json"), JSON.stringify({ routes: {} }));
  return root;
}
describe("runtime catalog artifact gate", () => {
  it("accepts runtime standalone output", () => { expect(verifyCatalogBuild(fixture()).renderMode).toBe("runtime"); });
  it("rejects prerendered route", () => {
    const root = fixture(); writeFileSync(join(root, "prerender-manifest.json"), JSON.stringify({ routes: { "/catalog": {} } }));
    expect(() => verifyCatalogBuild(root)).toThrow();
  });
  for (const suffix of ["server/app/catalog.html", "server/app/catalog.rsc", "standalone/.next/server/app/catalog.html", "standalone/.next/server/app/catalog.rsc"]) {
    it(`rejects frozen ${suffix}`, () => { const root = fixture(); writeFileSync(join(root, suffix), "empty catalog"); expect(() => verifyCatalogBuild(root)).toThrow(); });
  }
  for (const suffix of ["standalone/server.js", "server/app/catalog/page.js", "standalone/.next/server/app/catalog/page.js"]) {
    it(`rejects missing ${suffix}`, () => { const root = fixture(); rmSync(join(root, suffix)); expect(() => verifyCatalogBuild(root)).toThrow(); });
  }
});
