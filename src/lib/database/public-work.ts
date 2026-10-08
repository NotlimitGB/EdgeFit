import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { withOperationDeadline } from "@/lib/operation-deadline";
import { reportPublicCallerTimeout } from "./lifecycle-diagnostics";

export type PublicWorkKind = "critical" | "optional";
type Work = { kind: PublicWorkKind; signal: AbortSignal };
const work = new AsyncLocalStorage<Work>();
export const getPublicDbWork = () => work.getStore();

// Abort stops subsequent admission, NOT work already handed to postgres.
export function runPublicDbWork<T>(kind: PublicWorkKind, budgetMs: number,
  operation: (signal: AbortSignal) => T | PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const parent = work.getStore();
  const signal = parent ? AbortSignal.any([parent.signal, controller.signal]) : controller.signal;
  // Await inside ALS too: a directly returned lazy Query executes on assimilation.
  return withOperationDeadline(() => work.run({ kind, signal }, async () => await operation(signal)),
    budgetMs, () => { controller.abort(); reportPublicCallerTimeout(kind); });
}
