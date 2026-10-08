import "server-only";
import type { Sql } from "postgres";
import { OperationDeadlineError } from "@/lib/operation-deadline";
import { withOperationDeadline } from "@/lib/operation-deadline";
import { isPublicDbFlow } from "./lifecycle-diagnostics";

export const DB_OPERATION_BUDGET_MS = 10_000;
type Query = {
  handler: (query: Query) => unknown;
  resolve: (value: unknown) => unknown;
  reject: (error: unknown) => unknown;
};

// The original driver Query stays lazy and retains its result/error identity.
// Deadline includes connection preparation and queueing. No SQL retry/cancel.
export function boundDatabaseOperations(sql: Sql, retire: () => void, budgetMs = DB_OPERATION_BUDGET_MS,
  shouldBound: () => boolean = isPublicDbFlow): Sql {
  const seen = new WeakSet<object>();
  const clients = new WeakMap<object, Sql>();
  let retired = false;
  function expire() {
    if (retired) return;
    retired = true;
    retire();
  }
  function observe<T>(value: T): T {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    const query = value as unknown as Query;
    if (typeof query.handler !== "function" || typeof query.resolve !== "function" || typeof query.reject !== "function") return value;
    seen.add(value);
    const handler = query.handler, resolve = query.resolve, reject = query.reject;
    let timer: ReturnType<typeof setTimeout> | undefined;
    query.handler = function (q) {
      if (retired) return q.reject(new OperationDeadlineError());
      if (!shouldBound()) return Reflect.apply(handler, this, [q]);
      timer = setTimeout(() => {
        expire();
        q.reject(new OperationDeadlineError());
      }, budgetMs);
      timer.unref?.();
      try { return Reflect.apply(handler, this, [q]); }
      catch (error) { return q.reject(error); }
    };
    Object.assign(query.handler, { debug: (handler as unknown as { debug?: unknown }).debug });
    query.resolve = function (result) { clearTimeout(timer); return Reflect.apply(resolve, this, [result]); };
    query.reject = function (error) { clearTimeout(timer); return Reflect.apply(reject, this, [error]); };
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
            const execute = () => {
            if (retired) throw new OperationDeadlineError();
            return Reflect.apply(member, target, args.map(arg =>
              typeof arg === "function" ? (tx: Sql) => arg(wrap(tx)) : arg));
            };
            return shouldBound() ? withOperationDeadline(execute, budgetMs, expire) : execute();
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
