import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { verifySavedResultBuild } from "./verify-saved-result-build.mjs";

const temporaryDirectories = [];
afterEach(() => {
  // Only explicit directories created by this fixture are removed.
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function fixture({ flags = [true], staticRoute = true, missing = "", standaloneFlags = flags } = {}) {
  const root = mkdtempSync(join(tmpdir(), "snowdex-saved-build-"));
  temporaryDirectories.push(root);
  writeFileSync(join(root, "prerender-manifest.json"), JSON.stringify({ routes: staticRoute ? { "/result": {} } : {} }));
  mkdirSync(join(root, "standalone"));
  if (missing !== "server") writeFileSync(join(root, "standalone/server.js"), "// fixture server");
  for (const [directory, values] of [[root, flags], [join(root, "standalone/.next"), standaloneFlags]]) {
    mkdirSync(join(directory, "server/app"), { recursive: true });
    const flight = values.map(savedResultsEnabled => JSON.stringify({ savedResultsEnabled })).join("\n");
    if (missing !== "html") writeFileSync(join(directory, "server/app/result.html"), `<script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`);
    if (missing !== "rsc") writeFileSync(join(directory, "server/app/result.rsc"), flight);
  }
  return root;
}
describe("actual saved-result build artifact gate", () => {
  it("accepts enabled HTML/RSC in both original and standalone output", () => {
    expect(verifySavedResultBuild(fixture())).toEqual({ route: "/result", renderMode: "static", savedResultsEnabled: true, standalone: true });
  });
  it.each([{ flags: [false] }, { flags: [true, false] }, { flags: [] }])("rejects disabled, conflicting or missing props: $flags", ({ flags }) => {
    expect(() => verifySavedResultBuild(fixture({ flags }))).toThrow();
  });
  it("rejects a disabled standalone copy even when the original is enabled", () => {
    expect(() => verifySavedResultBuild(fixture({ standaloneFlags: [false] }))).toThrow();
  });
  it.each(["html", "rsc", "server"])("fails closed for missing %s", missing => {
    expect(() => verifySavedResultBuild(fixture({ missing }))).toThrow();
  });
  it("rejects a non-static result route", () => {
    expect(() => verifySavedResultBuild(fixture({ staticRoute: false }))).toThrow("prerendered");
  });
  it("returns a failing CLI exit status without exposing artifact contents", () => {
    const result = spawnSync(process.execPath, [resolve("scripts/verify-saved-result-build.mjs"), fixture({ flags: [false] })], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe("Saved-result production artifact verification failed.");
  });
});
