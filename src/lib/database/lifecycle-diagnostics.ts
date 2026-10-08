import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";

type Context = {
  scope: "canonical_catalog" | "recommendation" | "outbound";
  stage: string;
  traceId: string;
  parentTraceId?: string;
};
const context = new AsyncLocalStorage<Context>();
const processId = randomUUID();

// Caller events have no fabricated client ID when no DB client was acquired.
const callerEvents: Record<string, unknown>[] = [];
let callerDrainScheduled = false, callerDropped = 0;
function drainCallers() {
  callerDrainScheduled = false;
  for (const event of callerEvents.splice(0, 32)) {
    try { console.info(JSON.stringify({ ...event, droppedEvents: callerDropped })); } catch { /* fail open */ }
  }
  if (callerEvents.length) scheduleCallers();
}
function scheduleCallers() {
  if (callerDrainScheduled) return;
  callerDrainScheduled = true; setImmediate(drainCallers).unref();
}
export function reportPublicCallerTimeout(kind: "critical" | "optional") {
  try {
    if (callerEvents.length >= 256) { callerDropped++; return; }
    const current = context.getStore();
    callerEvents.push({ scope: "public_db_work", event: "caller_timeout", utc: new Date().toISOString(), processId,
      workKind: kind, requestScope: current?.scope, stage: current?.stage, traceId: current?.traceId });
    scheduleCallers();
  } catch { /* diagnostics cannot affect the response */ }
}

export function withDbDiagnosticContext<T>(value: Context, operation: () => T): T {
  const parent = context.getStore();
  return context.run({ ...value, ...(parent && parent.traceId !== value.traceId
    ? { parentTraceId: parent.traceId } : {}) }, operation);
}

export function withDbDiagnosticStage<T>(
  stage: "catalog_loading" | "focused_board_lookup" | "result_persistence" | "product_lookup",
  operation: () => T,
): T {
  const current = context.getStore();
  return current ? context.run({ ...current, stage }, operation) : operation();
}

type DriverQuery = {
  handler: (query: DriverQuery) => unknown;
  resolve: (value: unknown) => unknown;
  reject: (error: unknown) => unknown;
  state: unknown;
  string?: string;
};
type RecordEntry = {
  operationId: string;
  context?: Context;
  started: number;
  dispatched: boolean;
  dispatchUnknown?: boolean;
  expired: boolean;
  observation?: ReturnType<typeof setTimeout>;
  expiry?: ReturnType<typeof setTimeout>;
};
type Event = Record<string, unknown>;

function safeError(error: unknown) {
  // Never emit arbitrary error names/codes, which can themselves contain secrets.
  let code: unknown;
  try { code = (error as { code?: unknown })?.code; } catch { /* hostile getter */ }
  if (code === "OPERATION_DEADLINE") return { category: "operation_deadline" };
  if (code === "PUBLIC_DB_SATURATED") return { category: "admission_saturation" };
  if (code === "PUBLIC_DB_ABANDONED") return { category: "abandoned_context" };
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
    return { category: "postgres", sqlstate: code };
  }
  const network = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EPIPE"];
  const driver = ["CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED"];
  return { category: typeof code === "string" && network.includes(code) ? "network"
    : typeof code === "string" && driver.includes(code) ? "driver_connection" : "unknown" };
}

export function createDbLifecycleDiagnostics(
  logger: (line: string) => void = (line) => console.info(line),
) {
  const clientId = randomUUID();
  const records = new Map<DriverQuery, RecordEntry>();
  const queries = new WeakSet<object>();
  const clients = new WeakMap<object, object>();
  const events: Event[] = [];
  let drainScheduled = false;
  let droppedEvents = 0;
  let countersComplete = true;

  function drain() {
    drainScheduled = false;
    const batch = events.splice(0, 32);
    for (const event of batch) {
      try { logger(JSON.stringify({ ...event, droppedEvents })); } catch { /* fail open */ }
    }
    if (events.length) scheduleDrain();
  }
  function scheduleDrain() {
    if (drainScheduled) return;
    drainScheduled = true;
    setImmediate(drain).unref();
  }
  function emit(event: Event) {
    try {
      if (events.length >= 256) { droppedEvents++; return; }
      let waiting = 0;
      for (const entry of records.values()) if (!entry.dispatched && !entry.dispatchUnknown) waiting++;
      events.push({ scope: "db_client", utc: new Date().toISOString(), processId, clientId,
        trackedInFlight: records.size, trackedBeforeDriverExecution: waiting,
        countersComplete, ...event });
      scheduleDrain();
    } catch { /* diagnostics may not break the query */ }
  }
  function details(entry: RecordEntry) {
    return { operationId: entry.operationId, requestScope: entry.context?.scope ?? "unscoped",
      stage: entry.context?.stage ?? "unscoped", traceId: entry.context?.traceId,
      parentTraceId: entry.context?.parentTraceId,
      durationMs: Math.max(0, Math.round(performance.now() - entry.started)) };
  }
  function settle(query: DriverQuery, event: "success" | "error", error?: unknown) {
    const entry = records.get(query);
    if (!entry) return;
    clearTimeout(entry.observation);
    clearTimeout(entry.expiry);
    records.delete(query);
    emit({ ...details(entry), event, dispatchAttemptObserved: entry.dispatched,
      ...(event === "error" ? safeError(error) : {}) });
  }
  function observe<T>(value: T): T {
    if (!value || typeof value !== "object") return value;
    const query = value as unknown as DriverQuery;
    if (typeof query.handler !== "function" || typeof query.resolve !== "function"
      || typeof query.reject !== "function" || queries.has(query)) return value;
    queries.add(query);
    const handler = query.handler;
    const resolve = query.resolve;
    const reject = query.reject;
    query.handler = function (q) {
      try {
        if (records.size < 256) {
          const entry: RecordEntry = { operationId: randomUUID(), context: context.getStore(),
            started: performance.now(), dispatched: false, expired: false };
          records.set(q, entry);
          emit({ ...details(entry), event: "start" });
          entry.observation = setTimeout(() => emit({ ...details(entry), event: "observation",
            status: entry.dispatchUnknown ? "DISPATCH_CORRELATION_UNKNOWN"
              : entry.dispatched ? "DRIVER_DISPATCH_ATTEMPT_NOT_COMPLETED" : "WAITING_BEFORE_DRIVER_EXECUTION" }), 10_000);
          entry.observation.unref();
          entry.expiry = setTimeout(() => {
            records.delete(q);
            entry.expired = true;
            countersComplete = false;
            emit({ ...details(entry), event: "tracking_expired" });
          }, 60_000);
          entry.expiry.unref();
        } else {
          countersComplete = false;
          emit({ event: "tracking_overflow" });
        }
      } catch { /* fail open */ }
      return Reflect.apply(handler, this, [q]);
    };
    Object.assign(query.handler, { debug: (handler as unknown as { debug?: unknown }).debug });
    query.resolve = function (result) {
      try { settle(query, "success"); } catch { /* fail open */ }
      return Reflect.apply(resolve, this, [result]);
    };
    query.reject = function (error) {
      try { settle(query, "error", error); } catch { /* fail open */ }
      return Reflect.apply(reject, this, [error]);
    };
    return value;
  }

  function wrap(sql: Sql): Sql {
    const cached = clients.get(sql);
    if (cached) return cached as Sql;
    const proxy = new Proxy(sql, {
      apply(target, thisArg, args) { return observe(Reflect.apply(target, thisArg, args)); },
      get(target, property, receiver) {
        const member = Reflect.get(target, property, receiver);
        if (typeof member !== "function") return member;
        if (property === "begin" || property === "savepoint") {
          return (...args: unknown[]) => Reflect.apply(member, target, args.map(arg =>
            typeof arg === "function" ? (tx: Sql) => arg(wrap(tx)) : arg));
        }
        if (property === "unsafe" || property === "file") {
          return (...args: unknown[]) => observe(Reflect.apply(member, target, args));
        }
        return member;
      },
    });
    clients.set(sql, proxy);
    return proxy;
  }
  function debug(connectionId: number, statement: string) {
    try {
      // postgres.js 3.4.9 sets q.string/state before calling debug in build().
      // This is a dispatch ATTEMPT, before socket write, not server receipt.
      const matches = [...records].filter(([query, entry]) =>
        !entry.dispatched && query.state != null && query.string === statement);
      if (matches.length !== 1) {
        if (matches.length > 1) {
          countersComplete = false;
          for (const [, entry] of matches) entry.dispatchUnknown = true;
        }
        emit({ event: "driver_dispatch_attempt", correlation: "uncorrelated", connectionId });
        return;
      }
      const [, entry] = matches[0];
      entry.dispatched = true;
      emit({ ...details(entry), event: "driver_dispatch_attempt", connectionId,
        correlation: "matched", beforeDriverExecutionMs: Math.max(0, Math.round(performance.now() - entry.started)) });
    } catch { /* fail open, including driver callbacks */ }
  }
  return { wrap, debug, boundary: (event: { event: "admission_saturated" | "admission_available" | "abandoned_context" | "operator_action_required" | "transaction_observation";
    publicInFlight: number; limit: number; workKind?: "critical" | "optional"; unit?: "query" | "transaction"; publicWorkId?: string; status?: "DISPATCH_CORRELATION_UNKNOWN" }) => {
    const current = context.getStore();
    emit({ ...event, requestScope: current?.scope, stage: current?.stage, traceId: current?.traceId });
  } };
}
