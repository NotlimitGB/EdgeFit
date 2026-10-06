import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function verifyCatalogBuild(buildDirectory = ".next") {
  const root = resolve(buildDirectory);
  const manifest = JSON.parse(readFileSync(join(root, "prerender-manifest.json"), "utf8"));
  if (Object.hasOwn(manifest.routes ?? {}, "/catalog")) throw new Error("Catalog must not be prerendered.");
  if (!statSync(join(root, "standalone/server.js")).isFile()) throw new Error("Standalone server required.");
  for (const directory of [root, join(root, "standalone/.next")]) {
    const routes = JSON.parse(readFileSync(join(directory, "server/app-paths-manifest.json"), "utf8"));
    const routeModule = routes["/catalog/page"];
    if (typeof routeModule !== "string" || !statSync(join(directory, "server", routeModule)).isFile()) {
      throw new Error("Runtime catalog module required.");
    }
    for (const extension of ["html", "rsc"]) {
      if (existsSync(join(directory, `server/app/catalog.${extension}`))) throw new Error("Static catalog artifact forbidden.");
    }
  }
  return { route: "/catalog", renderMode: "runtime", standalone: true };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(verifyCatalogBuild(process.argv[2]))); }
  catch { console.error("Runtime catalog artifact verification failed."); process.exitCode = 1; }
}
