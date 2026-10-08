import { afterEach, describe, expect, it, vi } from "vitest";
import postgres, { type Sql } from "postgres";
import { createServer, type Socket } from "node:net";
import { boundDatabaseOperations } from "./operation-boundary";
import { createDbLifecycleDiagnostics } from "./lifecycle-diagnostics";
vi.mock("server-only", () => ({}));
afterEach(() => vi.useRealTimers());

function harness(shouldBound = () => true) {
  const raw = postgres({ host: "127.0.0.1", port: 1, fetch_types: false });
  const queries: (ReturnType<typeof raw.unsafe> & { handler: () => void; resolve: (v: unknown) => void; reject: (v: unknown) => void })[] = [];
  const executions = vi.fn();
  const fn = Object.assign(() => {
    const q = raw.unsafe("private SQL", ["private parameter"]) as typeof queries[number];
    q.handler = executions; queries.push(q); return q;
  }, { unsafe: () => fn(), json: raw.json, begin: vi.fn(() => new Promise(() => undefined)) });
  const retire = vi.fn();
  const sql = boundDatabaseOperations(fn as unknown as Sql, retire, 10_000, shouldBound);
  return { raw, sql, queries, retire, executions };
}

describe("DB execution boundary", () => {
  it("leaves unscoped scheduler/import execution without a new deadline", async () => {
    vi.useFakeTimers(); const h = harness(() => false);
    const pending = Promise.resolve(h.sql.unsafe("select")); await vi.advanceTimersByTimeAsync(20_000);
    expect(vi.getTimerCount()).toBe(0); expect(h.retire).not.toHaveBeenCalled();
    h.queries[0].resolve([]); await pending; await h.raw.end();
  });
  it("keeps queries lazy, starts once and preserves values/errors/helpers", async () => {
    vi.useFakeTimers(); const h = harness();
    const q = h.sql`select ${"parameter"}`;
    expect(vi.getTimerCount()).toBe(0);
    const pending = Promise.resolve(q); await vi.advanceTimersByTimeAsync(0);
    expect(h.executions).toHaveBeenCalledTimes(1);
    const result = [{ value: "ok" }]; h.queries[0].resolve(result);
    expect(await pending).toBe(result); expect(vi.getTimerCount()).toBe(0);
    const error = new Error("private error");
    const failed = Promise.resolve(h.sql.unsafe("select")).catch(e => e);
    await vi.advanceTimersByTimeAsync(0); h.queries[1].reject(error);
    expect(await failed).toBe(error); expect(h.retire).not.toHaveBeenCalled();
    expect(h.sql.json({ a: 1 })).toEqual(h.raw.json({ a: 1 })); await h.raw.end();
  });

  it("bounds queued queries, retires once, rejects retained lazy queries and emits sanitized diagnostics", async () => {
    vi.useFakeTimers(); const h = harness(), lines: string[] = [];
    const diagnostics = createDbLifecycleDiagnostics(line => lines.push(line));
    const sql = diagnostics.wrap(h.sql);
    const retained = sql.unsafe("later");
    const a = Promise.resolve(sql.unsafe("first")).catch(e => e);
    const b = Promise.resolve(sql.unsafe("queued")).catch(e => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await a).code).toBe("OPERATION_DEADLINE"); expect((await b).code).toBe("OPERATION_DEADLINE");
    expect(h.retire).toHaveBeenCalledTimes(1);
    expect((await Promise.resolve(retained).catch(e => e)).code).toBe("OPERATION_DEADLINE");
    await vi.advanceTimersByTimeAsync(1);
    expect(lines.join()).toContain('"category":"operation_deadline"');
    expect(lines.join()).not.toMatch(/private SQL|private parameter|private error/);
    expect(vi.getTimerCount()).toBe(0); await h.raw.end();
  });

  it("bounds transaction acquisition even before the callback runs", async () => {
    vi.useFakeTimers(); const h = harness(); const callback = vi.fn();
    const pending = h.sql.begin(callback).catch(e => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).code).toBe("OPERATION_DEADLINE");
    expect(callback).not.toHaveBeenCalled(); expect(h.retire).toHaveBeenCalledTimes(1); await h.raw.end();
  });
});

it.each([false, true])("installed driver teardown releases stalled protocol and queued operations (dispatch=%s)", async dispatched => {
  // No PostgreSQL or production DB: a TCP peer deliberately never replies.
  const peers = new Set<Socket>();
  const server = createServer(socket => {
    peers.add(socket); let started = false;
    socket.on("data", () => {
      if (dispatched && !started) {
        started = true;
        // AuthenticationOk + ReadyForQuery; then deliberately no SQL response.
        socket.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]));
      }
    }); socket.on("close", () => peers.delete(socket));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const lines: string[] = [], diagnostics = createDbLifecycleDiagnostics(line => lines.push(line));
  const raw = postgres({ host: "127.0.0.1", port: (server.address() as { port: number }).port,
    max: 1, prepare: false, connect_timeout: 10, fetch_types: false, debug: diagnostics.debug });
  let teardown: Promise<void> | undefined;
  const retire = vi.fn(() => { teardown = raw.end({ timeout: 0 }); });
  const sql = diagnostics.wrap(boundDatabaseOperations(raw, retire, 100, () => true));
  try {
    const pending = [Promise.resolve(sql.unsafe("select 1")), Promise.resolve(sql.unsafe("select 2"))];
    const results = await Promise.allSettled(pending);
    expect(results.every(r => r.status === "rejected")).toBe(true);
    expect(retire).toHaveBeenCalledTimes(1); await teardown;
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(peers.size).toBe(0);
    expect(lines.some(line => line.includes('"event":"driver_dispatch_attempt"'))).toBe(dispatched);
    await expect(sql.unsafe("select 3")).rejects.toMatchObject({ code: "OPERATION_DEADLINE" });
  } finally {
    await raw.end({ timeout: 0 }); for (const peer of peers) peer.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 3000);
