import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type postgres from "postgres";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ end: vi.fn(), constructor: vi.fn(), drivers: [] as ReturnType<typeof postgres>[] }));
vi.mock("./config", () => ({ базаНастроена: () => true, получитьАдресБазы: () => "postgres://private-dsn", получитьРежимSsl: () => "require" }));
vi.mock("postgres", async () => {
  const { default: actual } = await vi.importActual<typeof import("postgres")>("postgres");
  return { default: (...args: unknown[]) => {
    mocks.constructor(...args);
    const raw = actual({ host: "127.0.0.1", port: 1, fetch_types: false }); mocks.drivers.push(raw);
    const make = () => { const q = raw.unsafe("private SQL", ["private input"]); q.handler = () => undefined; return q; };
    return Object.assign(make, { unsafe: make, end: mocks.end });
  } };
});
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); mocks.constructor.mockClear(); mocks.end.mockReset(); vi.spyOn(console, "info").mockImplementation(() => undefined); });
afterEach(async () => { for (const driver of mocks.drivers.splice(0)) await driver.end(); vi.useRealTimers(); vi.restoreAllMocks(); });

it.each(["reject", "pending"])("never invokes %s teardown or creates a replacement on repeated caller timeouts", async behavior => {
  mocks.end.mockImplementation(() => behavior === "pending" ? new Promise(() => undefined) : Promise.reject(new Error("private teardown error")));
  const { получитьКлиентБазы } = await import("./client");
  const { runPublicDbWork } = await import("./public-work");
  const first = получитьКлиентБазы();
  for (let i = 0; i < 3; i++) {
    const caller = runPublicDbWork("optional", 500, () => Promise.resolve(first.unsafe("select"))).catch(e => e);
    await vi.advanceTimersByTimeAsync(500); expect((await caller).code).toBe("OPERATION_DEADLINE");
    expect(получитьКлиентБазы()).toBe(first);
  }
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.end).not.toHaveBeenCalled(); expect(mocks.constructor).toHaveBeenCalledOnce();
  expect(mocks.constructor.mock.calls[0][1]).toMatchObject({ ssl: "require", max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10 });
  const logs = vi.mocked(console.info).mock.calls.flat().join();
  expect(logs).toContain("caller_timeout"); expect(logs).toContain("operator_action_required");
  expect(logs).not.toMatch(/private-dsn|private SQL|private input|private teardown|client_recovery_ready|client_retired/);
});
