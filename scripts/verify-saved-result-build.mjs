// Filesystem-only production artifact gate; no app imports, env loading or DB access.
import { readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

function assertEnabledFlight(flight) {
  const flags = [...flight.matchAll(/"savedResultsEnabled"\s*:\s*(true|false)/gu)];
  if (!flags.length || flags.some((match) => match[1] !== "true")) {
    throw new Error("Saved-result artifact must contain only enabled capability props.");
  }
}

function assertEnabledHtml(html) {
  const flight = [...html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gsu)]
    .map((match) => JSON.parse(match[1]))
    .filter((chunk) => chunk[0] === 1 && typeof chunk[1] === "string")
    .map((chunk) => chunk[1])
    .join("");
  assertEnabledFlight(flight);
}

export function verifySavedResultBuild(buildDirectory = ".next") {
  const root = resolve(buildDirectory);
  const manifest = JSON.parse(readFileSync(join(root, "prerender-manifest.json"), "utf8"));
  if (!Object.hasOwn(manifest.routes ?? {}, "/result")) {
    throw new Error("Result route must remain prerendered.");
  }
  const standalone = join(root, "standalone");
  if (!statSync(join(standalone, "server.js")).isFile()) {
    throw new Error("Standalone server artifact is required.");
  }
  for (const directory of [root, join(standalone, ".next")]) {
    const html = readFileSync(join(directory, "server/app/result.html"), "utf8");
    const flight = readFileSync(join(directory, "server/app/result.rsc"), "utf8");
    assertEnabledHtml(html);
    assertEnabledFlight(flight);
  }
  return { route: "/result", renderMode: "static", savedResultsEnabled: true, standalone: true };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(verifySavedResultBuild(process.argv[2])));
  } catch {
    // Do not print filesystem contents or unrelated build/environment values.
    console.error("Saved-result production artifact verification failed.");
    process.exitCode = 1;
  }
}
