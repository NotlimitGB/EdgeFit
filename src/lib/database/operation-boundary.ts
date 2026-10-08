import "server-only";
import type { Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { getPublicDbWork, type PublicWorkKind } from "./public-work";

export const PUBLIC_DB_WORK_LIMIT = 32;
export class PublicDbUnavailableError extends Error {
  readonly code: "PUBLIC_DB_SATURATED" | "PUBLIC_DB_ABANDONED";
  constructor(code: "PUBLIC_DB_SATURATED" | "PUBLIC_DB_ABANDONED") {
    super("Public database work unavailable"); this.code = code;
  }
}
type BoundaryEvent = { event: "admission_saturated" | "admission_available" | "abandoned_context" | "operator_action_required" | "transaction_observation";
  publicInFlight: number; limit: number; workKind?: PublicWorkKind; unit?: "query" | "transaction"; publicWorkId?: string; status?: "DISPATCH_CORRELATION_UNKNOWN" };
type Query = {
  handler: (query: Query) => unknown;
  resolve: (value: unknown) => unknown;
  reject: (error: unknown) => unknown;
};

// Admission is separate from tracing. Never retire, cancel, replay or
// synthetically settle an operation already handed to the driver.
export function boundDatabaseOperations(sql: Sql, report: (event: BoundaryEvent) => void = () => undefined): Sql {
  const seen = new WeakSet<object>();
  const clients = new WeakMap<object, Sql>();
  let inFlight = 0, saturationReported = false;
  function emit(event: BoundaryEvent["event"], workKind?: PublicWorkKind, unit?: BoundaryEvent["unit"], publicWorkId?: string) {
    try { report({ event, publicInFlight: inFlight, limit: PUBLIC_DB_WORK_LIMIT, workKind, unit, publicWorkId,
      ...(event === "transaction_observation" ? { status: "DISPATCH_CORRELATION_UNKNOWN" as const } : {}) }); } catch { /* logging cannot affect SQL */ }
  }
  function admit(unit: "query" | "transaction"): () => void {
    const context = getPublicDbWork();
    if (!context) return () => undefined;
    if (context.signal.aborted) {
      emit("abandoned_context", context.kind, unit);
      throw new PublicDbUnavailableError("PUBLIC_DB_ABANDONED");
    }
    if (inFlight >= PUBLIC_DB_WORK_LIMIT) {
      if (!saturationReported) { saturationReported = true; emit("admission_saturated", context.kind, unit); }
      throw new PublicDbUnavailableError("PUBLIC_DB_SATURATED");
    }
    inFlight++;
    const publicWorkId = randomUUID();
    // Query observations come from 039C. Transactions include driver-internal
    // acquisition/cleanup that cannot be precisely correlated to a Query.
    const observation = unit === "transaction" ? setTimeout(() => emit("transaction_observation", context.kind, unit, publicWorkId), 10_000) : undefined;
    observation?.unref();
    const timer = setTimeout(() => emit("operator_action_required", context.kind, unit, publicWorkId), 60_000);
    timer.unref?.();
    let settled = false;
    return () => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(observation); inFlight--;
      if (saturationReported && inFlight < PUBLIC_DB_WORK_LIMIT) { saturationReported = false; emit("admission_available"); }
    };
  }
  function observe<T>(value: T): T {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    const query = value as unknown as Query;
    if (typeof query.handler !== "function" || typeof query.resolve !== "function" || typeof query.reject !== "function") return value;
    seen.add(value);
    const handler = query.handler, resolve = query.resolve, reject = query.reject;
    let release: () => void = () => undefined;
    query.handler = function (q) {
      try { release = admit("query"); return Reflect.apply(handler, this, [q]); }
      catch (error) { return q.reject(error); }
    };
    Object.assign(query.handler, { debug: (handler as unknown as { debug?: unknown }).debug });
    query.resolve = function (result) { release(); return Reflect.apply(resolve, this, [result]); };
    query.reject = function (error) { release(); return Reflect.apply(reject, this, [error]); };
    return value;
  }
  function wrap(client: Sql): Sql {
    const cached = clients.get(client);
    if (cached) return cached;
    const proxy = new Proxy(client, {
      apply(target, thisArg, args) { return observe(Reflect.apply(target, thisArg, args)); },
      get(target, property, receiver) {
        const member = Reflect.get(target, property, receiver);
        if (typeof member !== "function") return member;
        if (property === "begin" || property === "savepoint") {
          return (...args: unknown[]) => {
            // Capacity lasts through acquisition, callback and commit/rollback.
            // Internal driver cleanup statements are not admission-blocked.
            const release = admit("transaction");
            try {
              const result = Reflect.apply(member, target, args.map(arg =>
                typeof arg === "function" ? (tx: Sql) => arg(wrap(tx)) : arg));
              return Promise.resolve(result).then(value => { release(); return value; }, error => { release(); throw error; });
            } catch (error) { release(); throw error; }
          };
        }
        if (property === "unsafe" || property === "file") return (...args: unknown[]) => observe(Reflect.apply(member, target, args));
        return member;
      },
    });
    clients.set(client, proxy);
    return proxy;
  }
  return wrap(sql);
}
