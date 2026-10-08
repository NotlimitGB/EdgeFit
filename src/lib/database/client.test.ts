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
    const make = () => {
      const q = raw.unsafe("private SQL", ["private input"]);
      Object.assign(q, { handler: () => undefined }); return q;
    };
    return Object.assign(make, { unsafe: make, end: mocks.end });
  } };
});
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); mocks.constructor.mockClear(); mocks.end.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(async () => { for (const driver of mocks.drivers.splice(0)) await driver.end(); vi.useRealTimers(); vi.restoreAllMocks(); });

it("closes exactly one generation, fails fast during teardown, and only then creates a fresh client", async () => {
  let finish!: () => void; mocks.end.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const { получитьКлиентБазы } = await import("./client");
  const { withDbDiagnosticContext } = await import("./lifecycle-diagnostics");
  const first = получитьКлиентБазы(); expect(получитьКлиентБазы()).toBe(first);
  const pending = withDbDiagnosticContext({ scope: "outbound", stage: "product_lookup", traceId: "test" },
    () => Promise.resolve(first.unsafe("select")).catch(e => e));
  await vi.advanceTimersByTimeAsync(10_000);
  expect((await pending).code).toBe("OPERATION_DEADLINE");
  expect(mocks.end).toHaveBeenCalledExactlyOnceWith({ timeout: 0 });
  expect(() => получитьКлиентБазы()).toThrow("deadline");
  expect(mocks.constructor).toHaveBeenCalledTimes(1);
  finish(); await vi.advanceTimersByTimeAsync(1);
  const second = получитьКлиентБазы(); expect(second).not.toBe(first);
  expect(mocks.constructor).toHaveBeenCalledTimes(2);
  expect(mocks.constructor.mock.calls[0][1]).toMatchObject({ ssl: "require", max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10 });
  const logs = vi.mocked(console.info).mock.calls.flat().join();
  expect(logs).toContain("client_retired"); expect(logs).toContain("client_recovery_ready");
  expect(logs).not.toMatch(/private-dsn|private SQL|private input/);
});
it("does not open overlapping clients when teardown fails", async () => {
  mocks.end.mockRejectedValue(new Error("private teardown error"));
  const { получитьКлиентБазы } = await import("./client");
  const { withDbDiagnosticContext } = await import("./lifecycle-diagnostics");
  const pending = withDbDiagnosticContext({ scope: "outbound", stage: "product_lookup", traceId: "test" },
    () => Promise.resolve(получитьКлиентБазы().unsafe("select")).catch(e => e));
  await vi.advanceTimersByTimeAsync(10_001); await pending;
  expect(() => получитьКлиентБазы()).toThrow("deadline");
  expect(mocks.constructor).toHaveBeenCalledTimes(1);
});
