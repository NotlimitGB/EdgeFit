import { afterEach, describe, expect, it, vi } from "vitest";
import postgres, { type Sql } from "postgres";
import { createServer, type Socket } from "node:net";
import { boundDatabaseOperations, PUBLIC_DB_WORK_LIMIT } from "./operation-boundary";
import { runPublicDbWork } from "./public-work";
import { createDbLifecycleDiagnostics, withDbDiagnosticContext } from "./lifecycle-diagnostics";
vi.mock("server-only", () => ({}));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function harness() {
  const raw = postgres({ host: "127.0.0.1", port: 1, fetch_types: false });
  const queries: (ReturnType<typeof raw.unsafe> & { resolve: (v: unknown) => void; reject: (v: unknown) => void })[] = [];
  const execute = vi.fn(), events = vi.fn();
  const make = () => { const q = raw.unsafe("private SQL", ["private input"]); q.handler = execute; queries.push(q); return q; };
  const tx = Object.assign(make, { unsafe: make, json: raw.json });
  const begin = vi.fn((callback: (sql: Sql) => unknown) => callback(tx as unknown as Sql));
  const source = Object.assign(make, { unsafe: make, json: raw.json, begin, end: vi.fn(), reserve: vi.fn(), cancel: vi.fn() });
  return { raw, source, queries, execute, begin, events, sql: boundDatabaseOperations(source as unknown as Sql, events) };
}
const scoped = <T>(operation: () => T) => runPublicDbWork("critical", 120_000, operation);

function diagnosticHarness() {
  const raw = postgres({ host: "127.0.0.1", port: 1, fetch_types: false });
  const queries: (ReturnType<typeof raw.unsafe> & { resolve: (v: unknown) => void; reject: (v: unknown) => void })[] = [];
  const execute = vi.fn(), lines: string[] = [];
  const make = () => {
    const query = raw.unsafe("sentinel private SQL", ["sentinel private parameter"]);
    query.handler = execute;
    queries.push(query);
    return query;
  };
  const source = Object.assign(make, { unsafe: make, json: raw.json });
  const diagnostics = createDbLifecycleDiagnostics(line => lines.push(line));
  const sql = diagnostics.wrap(boundDatabaseOperations(
    source as unknown as Sql, diagnostics.boundary, diagnostics,
  ));
  return { raw, queries, execute, lines, diagnostics, sql,
    events: () => lines.map(line => JSON.parse(line)) };
}

const flushDiagnostics = async () => {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
};

describe("public admission, never generation retirement", () => {
  it("admits a directly returned lazy Query inside the public work context", async () => {
    vi.useFakeTimers(); const h = harness();
    const pending = runPublicDbWork("optional", 500, () => h.sql.unsafe("returned-query")).catch(e => e);
    await vi.advanceTimersByTimeAsync(60_000); expect((await pending).code).toBe("OPERATION_DEADLINE");
    expect(h.events).toHaveBeenCalledWith(expect.objectContaining({ event: "operator_action_required", publicInFlight: 1 }));
    h.queries[0].resolve([]); await vi.advanceTimersByTimeAsync(1); expect(vi.getTimerCount()).toBe(0); await h.raw.end();
  });
  it("keeps laziness, one execution, original result/error identity and helpers", async () => {
    vi.useFakeTimers(); const h = harness(); const lazy = h.sql`select ${"input"}`;
    expect(h.execute).not.toHaveBeenCalled();
    const pending = scoped(() => Promise.resolve(lazy)); await vi.advanceTimersByTimeAsync(0);
    const result = [{ value: "ok" }]; h.queries[0].resolve(result); expect(await pending).toBe(result);
    const error = new Error("private error"); const failed = scoped(() => Promise.resolve(h.sql.unsafe("select"))).catch(e => e);
    await vi.advanceTimersByTimeAsync(0); h.queries[1].reject(error); expect(await failed).toBe(error);
    expect(h.execute).toHaveBeenCalledTimes(2); expect(h.sql.json({ a: 1 })).toEqual(h.raw.json({ a: 1 }));
    expect(vi.getTimerCount()).toBe(0); await h.raw.end();
  });

  it.each([500, 2000])("optional caller budget %s leaves original work and neighbors intact", async budget => {
    vi.useFakeTimers(); const h = harness();
    const background = Promise.resolve(h.sql.unsafe("unscoped")); await vi.advanceTimersByTimeAsync(0);
    const optional = runPublicDbWork("optional", budget, () => Promise.resolve(h.sql.unsafe("optional"))).catch(e => e);
    await vi.advanceTimersByTimeAsync(budget); expect((await optional).code).toBe("OPERATION_DEADLINE");
    const healthy = scoped(() => Promise.resolve(h.sql.unsafe("healthy"))); await vi.advanceTimersByTimeAsync(10_000);
    h.queries[2].resolve("healthy"); h.queries[0].resolve("background"); h.queries[1].resolve("late");
    expect(await healthy).toBe("healthy"); expect(await background).toBe("background");
    expect(h.source.end).not.toHaveBeenCalled(); expect(h.source.cancel).not.toHaveBeenCalled();
    expect(h.source.reserve).not.toHaveBeenCalled(); await h.raw.end();
  });

  it("holds all 32 slots after caller expiry and releases only on actual settlement", async () => {
    vi.useFakeTimers(); const h = harness();
    const callers = Array.from({ length: PUBLIC_DB_WORK_LIMIT }, () => runPublicDbWork("optional", 500, () => Promise.resolve(h.sql.unsafe("pending"))).catch(e => e));
    await vi.advanceTimersByTimeAsync(500); await Promise.all(callers);
    const overflow = scoped(() => Promise.resolve(h.sql.unsafe("overflow"))).catch(e => e);
    await vi.advanceTimersByTimeAsync(0); expect((await overflow).code).toBe("PUBLIC_DB_SATURATED");
    expect(h.execute).toHaveBeenCalledTimes(32);
    // Diagnostic-only context must not subject scheduler/reporting to admission.
    const unscoped = withDbDiagnosticContext({ scope: "canonical_catalog", stage: "background", traceId: "background" },
      () => Promise.resolve(h.sql.unsafe("unscoped")));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.events.mock.calls.filter(([e]) => e.event === "operator_action_required")).toHaveLength(32);
    expect(h.source.end).not.toHaveBeenCalled(); h.queries[33].resolve("background"); await unscoped;
    h.queries[0].resolve("late");
    const fresh = scoped(() => Promise.resolve(h.sql.unsafe("fresh"))); await vi.advanceTimersByTimeAsync(0);
    h.queries[34].resolve("fresh"); expect(await fresh).toBe("fresh");
    for (const q of h.queries) q.resolve([]);
    await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(0);
    expect(h.events.mock.calls.some(([e]) => e.event === "admission_available")).toBe(true); await h.raw.end();
  });

  it("does not initiate subsequent SQL after abandonment or replay an unknown-commit write", async () => {
    vi.useFakeTimers(); const h = harness(); let continuation!: Promise<unknown>;
    const caller = runPublicDbWork("optional", 500, async () => {
      await h.sql.unsafe("insert"); continuation = Promise.resolve(h.sql.unsafe("update")); return continuation;
    }).catch(e => e);
    await vi.advanceTimersByTimeAsync(500); await caller;
    h.queries[0].resolve([{ id: "acknowledged-late" }]); await vi.advanceTimersByTimeAsync(0);
    // The already observed underlying promise handles its late rejection.
    expect(h.execute).toHaveBeenCalledOnce(); expect(await continuation.catch(e => e)).toMatchObject({ code: "PUBLIC_DB_ABANDONED" });
    expect(h.source.end).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1); expect(vi.getTimerCount()).toBe(0); await h.raw.end();
  });

  it("counts transaction acquisition until real completion and never invents success", async () => {
    vi.useFakeTimers(); const h = harness(); let rejectTx!: (e: Error) => void;
    h.begin.mockImplementation(() => new Promise((_, reject) => { rejectTx = reject; }));
    const caller = runPublicDbWork("critical", 20_000, () => h.sql.begin(() => [])).catch(e => e);
    await vi.advanceTimersByTimeAsync(60_000); expect((await caller).code).toBe("OPERATION_DEADLINE");
    expect(h.events).toHaveBeenCalledWith(expect.objectContaining({ event: "operator_action_required", unit: "transaction", publicInFlight: 1 }));
    rejectTx(new Error("unknown commit")); await vi.advanceTimersByTimeAsync(0);
    expect(h.begin).toHaveBeenCalledOnce(); expect(h.source.end).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); await h.raw.end();
  });

  it("snapshots the oldest eight saturated public units with correlated dispatch and timeout state", async () => {
    const h = diagnosticHarness();
    const callers = withDbDiagnosticContext({ scope: "canonical_catalog", stage: "family_rows", traceId: "safe-trace" }, () =>
      Array.from({ length: PUBLIC_DB_WORK_LIMIT }, () => runPublicDbWork("optional", 50,
        () => Promise.resolve(h.sql.unsafe("sentinel private SQL", ["sentinel private parameter"]))).catch(error => error)));

    await new Promise(resolve => setTimeout(resolve, 100));
    const callerResults = await Promise.all(callers);
    expect(callerResults.every(error => error.code === "OPERATION_DEADLINE")).toBe(true);
    const overflow = await withDbDiagnosticContext(
      { scope: "canonical_catalog", stage: "family_rows", traceId: "safe-overflow-trace" },
      () => runPublicDbWork("critical", 500, () => Promise.resolve(h.sql.unsafe("overflow"))).catch(error => error),
    );
    expect(overflow.code).toBe("PUBLIC_DB_SATURATED");
    await flushDiagnostics();

    const saturated = h.events().find(event => event.event === "admission_saturated");
    expect(saturated).toMatchObject({ publicInFlight: 32, limit: 32, traceId: "safe-overflow-trace" });
    expect(saturated.utc).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(saturated.processId).toEqual(expect.any(String));
    expect(saturated.clientId).toEqual(expect.any(String));
    expect(saturated.oldestOperations).toHaveLength(8);
    expect(saturated.oldestOperations[0]).toMatchObject({
      publicWorkId: expect.any(String),
      operationId: expect.any(String),
      startedAtUtc: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      ageMs: expect.any(Number),
      workKind: "optional",
      unit: "query",
      requestScope: "canonical_catalog",
      stage: "family_rows",
      traceId: "safe-trace",
      driverDispatchAttempt: "not_observed",
      callerTimeoutObserved: true,
      underlyingSettled: false,
      capacityReleased: false,
    });
    expect(saturated.oldestOperations.every((entry: { startedAtUtc: string }) =>
      Date.parse(entry.startedAtUtc) <= Date.parse(saturated.utc))).toBe(true);
    const ages = saturated.oldestOperations.map((entry: { ageMs: number }) => entry.ageMs);
    expect(ages).toEqual([...ages].sort((a: number, b: number) => b - a));
    expect(h.lines.join("\n")).not.toContain("sentinel private SQL");
    expect(h.lines.join("\n")).not.toContain("sentinel private parameter");

    const first = saturated.oldestOperations[0];
    withDbDiagnosticContext({ scope: "outbound", stage: "unrelated_release", traceId: "unrelated" },
      () => h.queries[0].resolve([]));
    await flushDiagnostics();
    expect(h.events()).toContainEqual(expect.objectContaining({
      event: "admission_released",
      admissionId: first.admissionId,
      operationId: first.operationId,
      traceId: "safe-trace", stage: "family_rows", requestScope: "canonical_catalog",
      callerTimeoutObserved: true,
      underlyingSettled: true,
      capacityReleased: true,
    }));

    // Availability has resumed, but other snapshot holders still need a release event.
    const second = saturated.oldestOperations[1];
    h.queries[1].resolve([]);
    await flushDiagnostics();
    expect(h.events()).toContainEqual(expect.objectContaining({
      event: "admission_released", admissionId: second.admissionId,
      underlyingSettled: true, capacityReleased: true,
    }));

    const fresh = withDbDiagnosticContext({ scope: "canonical_catalog", stage: "family_rows", traceId: "fresh-trace" },
      () => runPublicDbWork("critical", 500, () => Promise.resolve(h.sql.unsafe("fresh"))));
    await flushDiagnostics();
    const freshQuery = h.queries.at(-1)!;
    freshQuery.resolve([{ value: "ok" }]);
    expect(await fresh).toEqual([{ value: "ok" }]);
    for (const query of h.queries) query.resolve([]);
    await h.raw.end();
  }, 5000);

  it("keeps an expired tracker holder identifiable until its real release", async () => {
    vi.useFakeTimers();
    const h = diagnosticHarness();
    const oldest = runPublicDbWork("optional", 500, () => Promise.resolve(h.sql.unsafe("oldest"))).catch(error => error);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(await oldest).toMatchObject({ code: "OPERATION_DEADLINE" });
    const rest = Array.from({ length: PUBLIC_DB_WORK_LIMIT - 1 }, () => scoped(() => Promise.resolve(h.sql.unsafe("rest"))));
    await vi.advanceTimersByTimeAsync(0);
    const overflow = scoped(() => Promise.resolve(h.sql.unsafe("overflow"))).catch(error => error);
    await vi.advanceTimersByTimeAsync(1);
    expect(await overflow).toMatchObject({ code: "PUBLIC_DB_SATURATED" });
    const snapshot = h.events().find(event => event.event === "admission_saturated").oldestOperations[0];
    expect(snapshot).toMatchObject({ operationId: expect.any(String), driverDispatchAttempt: "unknown",
      callerTimeoutObserved: true, underlyingSettled: false, capacityReleased: false });
    expect(snapshot.ageMs).toBeGreaterThanOrEqual(60_000);
    h.queries[0].resolve([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.events()).toContainEqual(expect.objectContaining({ event: "admission_released",
      admissionId: snapshot.admissionId, operationId: snapshot.operationId,
      underlyingSettled: true, capacityReleased: true }));
    for (const query of h.queries) query.resolve([]);
    await Promise.all(rest);
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(0);
    await h.raw.end();
  });

  it("preserves admission and settlement when every diagnostic observer throws", async () => {
    vi.useFakeTimers();
    const h = harness();
    const fail = () => { throw new Error("sentinel diagnostic failure"); };
    const sql = boundDatabaseOperations(h.source as unknown as Sql, fail, {
      bindAdmission: fail, releaseAdmission: fail, getAdmissionState: fail,
    });
    const callers = Array.from({ length: PUBLIC_DB_WORK_LIMIT }, () =>
      runPublicDbWork("optional", 500, () => Promise.resolve(sql.unsafe("pending"))).catch(error => error));
    await vi.advanceTimersByTimeAsync(500);
    expect((await Promise.all(callers)).every(error => error.code === "OPERATION_DEADLINE")).toBe(true);
    const overflow = scoped(() => Promise.resolve(sql.unsafe("overflow"))).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(await overflow).toMatchObject({ code: "PUBLIC_DB_SATURATED" });
    expect(h.execute).toHaveBeenCalledTimes(32);
    h.queries[0].resolve([]);
    const fresh = scoped(() => Promise.resolve(sql.unsafe("fresh")));
    await vi.advanceTimersByTimeAsync(0);
    h.queries.at(-1)!.resolve("ok");
    expect(await fresh).toBe("ok");
    for (const query of h.queries) query.resolve([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.source.end).not.toHaveBeenCalled();
    await h.raw.end();
  });
});

function message(type: string, payload = Buffer.alloc(0)) {
  const h = Buffer.alloc(5); h.write(type); h.writeInt32BE(payload.length + 4, 1); return Buffer.concat([h, payload]);
}
function answer() {
  const meta = Buffer.alloc(18); meta.writeInt32BE(25, 6); meta.writeInt16BE(-1, 10); meta.writeInt32BE(-1, 12);
  const value = Buffer.from("ok"), length = Buffer.alloc(4); length.writeInt32BE(value.length);
  return Buffer.concat([message("T", Buffer.concat([Buffer.from([0, 1]), Buffer.from("value\0"), meta])),
    message("D", Buffer.concat([Buffer.from([0, 1]), length, value])), message("C", Buffer.from("SELECT 1\0")), message("Z", Buffer.from("I"))]);
}

it("actual 3.4.9 half-open peer: repeated caller failures never end or replace the client", async () => {
  const peers = new Set<Socket>(); let released = false, held = 0, connections = 0;
  const server = createServer({ allowHalfOpen: true }, socket => {
    connections++; peers.add(socket); let startup = true, buffer = Buffer.alloc(0);
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= (startup ? 4 : 5)) {
        const length = buffer.readInt32BE(startup ? 0 : 1) + (startup ? 0 : 1); if (buffer.length < length) break;
        const type = startup ? "startup" : String.fromCharCode(buffer[0]); buffer = buffer.subarray(length);
        if (type === "startup") { startup = false; socket.write(Buffer.concat([message("R", Buffer.alloc(4)), message("Z", Buffer.from("I"))])); }
        else if (type === "Q") { if (released) socket.write(answer()); else held++; }
        // Deliberately do not close on EOF/Terminate: a half-open transport.
      }
    }); socket.on("close", () => peers.delete(socket));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const diagnostics = createDbLifecycleDiagnostics(() => undefined);
  const raw = postgres({ host: "127.0.0.1", port: (server.address() as { port: number }).port, max: 1, prepare: false, fetch_types: false, debug: diagnostics.debug });
  const end = vi.spyOn(raw, "end"), sql = diagnostics.wrap(boundDatabaseOperations(raw, diagnostics.boundary));
  try {
    for (let i = 0; i < 3; i++) await expect(runPublicDbWork("optional", 20, () => Promise.resolve(sql.unsafe("select 1")))).rejects.toMatchObject({ code: "OPERATION_DEADLINE" });
    expect(end).not.toHaveBeenCalled(); expect(connections).toBe(1); expect(peers.size).toBe(1);
    released = true; for (const peer of peers) for (let i = 0; i < held; i++) peer.write(answer());
    expect((await runPublicDbWork("critical", 1000, () => sql.unsafe("select 1")))[0].value).toBe("ok");
    expect(connections).toBe(1); expect(end).not.toHaveBeenCalled();
  } finally {
    // Test-owned cleanup only; production never calls end for a caller timeout.
    for (const peer of peers) peer.destroy(); await raw.end({ timeout: 0 });
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 3000);
