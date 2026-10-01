import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { createInternalAccessToken, INTERNAL_ACCESS_COOKIE } from "./src/lib/internal/access";

afterEach(() => vi.unstubAllEnvs());
describe("internal auth remains independent of host migration", () => {
  it.each(["edge-fit.vercel.app", "snowdex.ru", "preview.vercel.app"])("preserves unauthorized page/API protection on %s", async (host) => {
    vi.stubEnv("INTERNAL_ACCESS_PASSWORD", "synthetic-test-only");
    const page = await middleware(new NextRequest(`https://${host}/internal/catalog?tab=1`));
    const destination = new URL(page.headers.get("location")!);
    expect(destination.host).toBe(host);
    expect(destination.pathname).toBe("/internal/login");
    expect(destination.searchParams.get("next")).toBe("/internal/catalog?tab=1");
    expect((await middleware(new NextRequest(`https://${host}/api/catalog-import`))).status).toBe(401);
    const token = await createInternalAccessToken();
    const allowed = await middleware(new NextRequest(`https://${host}/internal/catalog`, {
      headers: { cookie: `${INTERNAL_ACCESS_COOKIE}=${token}` },
    }));
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
  });
  it("fails closed when internal access is unconfigured", async () => {
    vi.stubEnv("INTERNAL_ACCESS_PASSWORD", "");
    expect((await middleware(new NextRequest("https://snowdex.ru/api/internal/report"))).status).toBe(500);
  });
});
