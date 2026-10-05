import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../../middleware";
import { GET, dynamic } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("independent application liveness", () => {
  it("returns uncached plain text without redirect or cookies", async () => {
    const first = GET();
    const second = GET();
    expect(dynamic).toBe("force-dynamic");
    expect(first).not.toBe(second);
    for (const response of [first, second]) {
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("contains no imports, external calls or dependency access", () => {
    const source = readFileSync("src/app/health/route.ts", "utf8");
    expect(source).not.toMatch(/\b(import|require|fetch|process|window|console)\b/);
    expect(source).not.toMatch(/\b(cookies|headers|redirect|auth|database|analytics|filesystem)\s*\(/);
  });

  it("passes existing middleware without auth configuration on every relevant host", async () => {
    vi.stubEnv("INTERNAL_ACCESS_PASSWORD", "");
    vi.stubEnv("INTERNAL_ACCESS_SECRET", "");
    for (const host of ["127.0.0.1:3000", "localhost:3000", "shadow.example", "edge-fit.vercel.app", "snowdex.ru"]) {
      const response = await middleware(new NextRequest(`http://${host}/health`));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    }
  });
});
