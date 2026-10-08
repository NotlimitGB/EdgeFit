import { afterEach, describe, expect, it, vi } from "vitest";
import postgres, { type Sql } from "postgres";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { createDbLifecycleDiagnostics, withDbDiagnosticContext, withDbDiagnosticStage } from "./lifecycle-diagnostics";
import { boundDatabaseOperations } from "./operation-boundary";

vi.mock("server-only", () => ({}));
afterEach(() => { vi.useRealTimers(); });
const flush = async () => {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
};

function harness() {
  const lines: string[] = [];
  const diagnostics = createDbLifecycleDiagnostics(line => lines.push(line));
  const driver = postgres({ host: "127.0.0.1", port: 1, fetch_types: false, debug: diagnostics.debug });
  const sql = diagnostics.wrap(driver);
  function controlled() {
    // Real lazy Query objects from the installed driver; replace transport only.
    const query = driver.unsafe("sentinel private SQL", ["private parameter"]) as ReturnType<typeof driver.unsafe> & {
      handler: (query: unknown) => unknown;
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
    };
    query.handler = () => undefined;
    const fake = Object.assign(() => query, { unsafe: () => query });
    const wrapped = diagnostics.wrap(fake as unknown as Sql);
    return { query, value: wrapped.unsafe("ignored") };
  }
  return { lines, diagnostics, driver, sql, controlled,
    events: () => lines.map(line => JSON.parse(line)) };
}

describe("bounded DB lifecycle diagnostics", () => {
  it("keeps fragments and real queries lazy, and observes only execution", async () => {
    const h = harness();
    expect(h.sql.json({ private: true })).toEqual(h.driver.json({ private: true }));
    h.sql("column");
    const { query, value } = h.controlled();
    expect(h.events()).toEqual([]);
    const pending = Promise.resolve(value);
    await flush();
    expect(h.events().map(e => e.event)).toEqual(["start"]);
    query.resolve(["ok"]);
    expect(await pending).toEqual(["ok"]);
    await flush();
    expect(h.events().map(e => e.event)).toEqual(["start", "success"]);
    await h.driver.end();
  });

  it("preserves correlation across queued identical queries and dispatch attempts", async () => {
    const h = harness();
    const a = h.controlled(), b = h.controlled();
    const context = { scope: "canonical_catalog" as const, stage: "family_rows", traceId: "existing-trace" };
    const pa = withDbDiagnosticContext(context, () => Promise.resolve(a.value));
    const pb = withDbDiagnosticContext(context, () => Promise.resolve(b.value));
    await flush();
    Object.assign(a.query, { state: {}, string: "sentinel private SQL" });
    h.diagnostics.debug(1, "sentinel private SQL");
    Object.assign(b.query, { state: {}, string: "sentinel private SQL" });
    h.diagnostics.debug(1, "sentinel private SQL");
    a.query.resolve([]); b.query.resolve([]);
    await Promise.all([pa, pb]); await flush();
    const dispatched = h.events().filter(e => e.event === "driver_dispatch_attempt");
    expect(dispatched).toHaveLength(2);
    expect(new Set(dispatched.map(e => e.operationId)).size).toBe(2);
    expect(dispatched.every(e => e.traceId === "existing-trace" && e.correlation === "matched")).toBe(true);
    expect(h.lines.join()).not.toContain("sentinel private SQL");
    await h.driver.end();
  });

  it("marks ambiguous debug evidence uncorrelated rather than guessing", async () => {
    const h = harness(), a = h.controlled(), b = h.controlled();
    const pa = Promise.resolve(a.value), pb = Promise.resolve(b.value);
    await flush();
    for (const item of [a, b]) Object.assign(item.query, { state: {}, string: "same" });
    h.diagnostics.debug(1, "same"); await flush();
    expect(h.events().at(-1)).toMatchObject({ correlation: "uncorrelated" });
    a.query.resolve([]); b.query.resolve([]); await Promise.all([pa, pb]);
    await h.driver.end();
  });

  it("returns the original failure without sensitive diagnostic output", async () => {
    const h = harness(), a = h.controlled();
    const error = Object.assign(new Error("audit-private-db-detail"), {
      code: "ECONNRESET", name: "private name", connection: "postgres://secret", parameters: ["private"] });
    const pending = Promise.resolve(a.value).catch(e => e);
    await flush(); a.query.reject(error);
    expect(await pending).toBe(error); await flush();
    expect(h.events().at(-1)).toMatchObject({ event: "error", category: "network" });
    for (const secret of ["audit-private-db-detail", "private name", "postgres://secret", "private parameter"])
      expect(h.lines.join()).not.toContain(secret);
    await h.driver.end();
  });

  it("does not let a failing asynchronous logger affect settlement", async () => {
    const h = harness(), a = h.controlled();
    const fail = createDbLifecycleDiagnostics(() => { throw Error("logger failure"); });
    const wrapped = fail.wrap(Object.assign(() => a.query, { unsafe: () => a.query }) as unknown as Sql);
    const pending = Promise.resolve(wrapped`select`);
    await flush(); a.query.resolve(42);
    expect(await pending).toBe(42); await flush(); await h.driver.end();
  });

  it("bounds observation, registry expiry and log overflow without cancelling queries", async () => {
    vi.useFakeTimers();
    const h = harness(), a = h.controlled(), b = h.controlled();
    const pa = Promise.resolve(a.value), pb = Promise.resolve(b.value);
    await vi.advanceTimersByTimeAsync(0);
    Object.assign(a.query, { state: {}, string: "one" }); h.diagnostics.debug(1, "one");
    await vi.advanceTimersByTimeAsync(10_001);
    expect(h.events().filter(e => e.event === "observation").map(e => e.status)).toEqual([
      "DRIVER_DISPATCH_ATTEMPT_NOT_COMPLETED", "WAITING_BEFORE_DRIVER_EXECUTION"]);
    await vi.advanceTimersByTimeAsync(50_001);
    expect(h.events().filter(e => e.event === "tracking_expired")).toHaveLength(2);
    for (let i = 0; i < 300; i++) h.diagnostics.debug(1, "untracked");
    await vi.advanceTimersByTimeAsync(1);
    expect(h.events().at(-1).droppedEvents).toBeGreaterThan(0);
    expect(h.events().at(-1).countersComplete).toBe(false);
    a.query.resolve([]); b.query.resolve([]); await Promise.all([pa, pb]);
    await h.driver.end();
  });

  it("caps tracked operations at 256 and preserves every result on overflow", async () => {
    const h = harness();
    const items = Array.from({ length: 260 }, () => h.controlled());
    const pending = items.map(item => Promise.resolve(item.value));
    await flush();
    expect(h.events().every(e => e.trackedInFlight <= 256)).toBe(true);
    for (const item of items) item.query.resolve("ok");
    expect(await Promise.all(pending)).toEqual(Array(260).fill("ok"));
    for (let i = 0; i < 10; i++) await flush();
    expect(h.events().some(e => e.countersComplete === false)).toBe(true);
    await h.driver.end();
  });

  it("cleans timers on completion and associates nested stages with their parent trace", async () => {
    vi.useFakeTimers();
    const h = harness(), a = h.controlled();
    const pending = withDbDiagnosticContext({ scope: "recommendation", stage: "request", traceId: "parent" }, () =>
      withDbDiagnosticStage("catalog_loading", () =>
        withDbDiagnosticContext({ scope: "canonical_catalog", stage: "family_rows", traceId: "child" }, () => Promise.resolve(a.value))));
    await vi.advanceTimersByTimeAsync(1);
    a.query.resolve("ok"); await pending;
    await vi.advanceTimersByTimeAsync(60_002);
    expect(h.events().every(e => e.event !== "observation" && e.event !== "tracking_expired")).toBe(true);
    expect(h.events()[0]).toMatchObject({ traceId: "child", parentTraceId: "parent", stage: "family_rows" });
    await h.driver.end();
  });
});

function message(type: string, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(5); header.write(type); header.writeInt32BE(payload.length + 4, 1);
  return Buffer.concat([header, payload]);
}
function rowDescription() {
  const metadata = Buffer.alloc(18);
  metadata.writeInt32BE(25, 6); metadata.writeInt16BE(-1, 10); metadata.writeInt32BE(-1, 12);
  return message("T", Buffer.concat([Buffer.from([0, 1]), Buffer.from("value\0"), metadata]));
}

it("postgres.js 3.4.9 actual wire execution: query, parameters and transaction retain behavior", async () => {
  const lines: string[] = [];
  const diagnostics = createDbLifecycleDiagnostics(line => lines.push(line));
  const server = createServer(socket => {
    let startup = true, buffer = Buffer.alloc(0);
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= (startup ? 4 : 5)) {
        const length = buffer.readInt32BE(startup ? 0 : 1) + (startup ? 0 : 1);
        if (buffer.length < length) break;
        const type = startup ? "startup" : String.fromCharCode(buffer[0]);
        buffer = buffer.subarray(length);
        if (type === "startup") {
          startup = false;
          socket.write(Buffer.concat([message("R", Buffer.alloc(4)), message("K", Buffer.alloc(8)), message("Z", Buffer.from("I"))]));
        } else if (type === "P") socket.write(message("1"));
        else if (type === "D") socket.write(Buffer.concat([message("t", Buffer.from([0, 1, 0, 0, 0, 25])), rowDescription()]));
        else if (type === "B") socket.write(message("2"));
        else if (type === "E" || type === "Q") {
          const value = Buffer.from("ok"), size = Buffer.alloc(4); size.writeInt32BE(value.length);
          socket.write(Buffer.concat([...(type === "Q" ? [rowDescription()] : []),
            message("D", Buffer.concat([Buffer.from([0, 1]), size, value])), message("C", Buffer.from("SELECT 1\0")),
            ...(type === "Q" ? [message("Z", Buffer.from("I"))] : [])]));
        } else if (type === "S") socket.write(message("Z", Buffer.from("I")));
        else if (type === "X") socket.end();
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const driver = postgres({ host: "127.0.0.1", port, max: 1, prepare: false, fetch_types: false, debug: diagnostics.debug });
  const sql = diagnostics.wrap(boundDatabaseOperations(driver, () => { void driver.end({ timeout: 0 }); }));
  try {
    expect((await sql`select ${"secret parameter"} as value`)[0].value).toBe("ok");
    await sql.begin(async tx => { expect((await tx.unsafe("select 1"))[0].value).toBe("ok"); });
    await flush();
    const events = lines.map(line => JSON.parse(line));
    expect(events.filter(e => e.event === "success")).toHaveLength(2);
    expect(events.filter(e => e.correlation === "matched")).toHaveLength(2);
    expect(lines.join()).not.toContain("secret parameter");
    // The callback is before socket write. Guard the exact installed-driver boundary.
    const source = readFileSync("node_modules/postgres/src/connection.js", "utf8");
    expect(source.indexOf("build(q)\n")).toBeLessThan(source.indexOf("return write(toBuffer(q))"));
    expect(source.indexOf("q.string = string")).toBeLessThan(source.indexOf("options.debug(id, string"));
  } finally {
    await driver.end({ timeout: 1 });
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 10_000);
