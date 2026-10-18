import "server-only";
import type { Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { getDbDiagnosticContext } from "./lifecycle-diagnostics";
import { getPublicDbWork, type PublicWorkKind } from "./public-work";

export const PUBLIC_DB_WORK_LIMIT = 32;
const SATURATION_SNAPSHOT_LIMIT = 8;

export class PublicDbUnavailableError extends Error {
  readonly code: "PUBLIC_DB_SATURATED" | "PUBLIC_DB_ABANDONED" | "PUBLIC_DB_UNAVAILABLE";
  constructor(code: "PUBLIC_DB_SATURATED" | "PUBLIC_DB_ABANDONED" | "PUBLIC_DB_UNAVAILABLE") {
    super("Public database work unavailable"); this.code = code;
  }
}

type AdmissionUnit = "query" | "transaction";
type DispatchState = "observed" | "not_observed" | "unknown";
type AdmissionEvent = {
  event: "admission_saturated" | "admission_available" | "abandoned_context" | "operator_action_required" | "transaction_observation" | "admission_released";
  publicInFlight: number;
  limit: number;
  workKind?: PublicWorkKind;
  unit?: AdmissionUnit;
  admissionId?: string;
  publicWorkId?: string;
  operationId?: string;
  ageMs?: number;
  driverDispatchAttempt?: DispatchState;
  callerTimeoutObserved?: boolean;
  underlyingSettled?: boolean;
  capacityReleased?: boolean;
  snapshotComplete?: boolean;
  oldestOperations?: Array<{
    admissionId: string;
    operationId?: string;
    publicWorkId: string;
    relatedPublicWorkIds: string[];
    startedAtUtc: string;
    ageMs: number;
    workKind: PublicWorkKind;
    unit: AdmissionUnit;
    requestScope: string;
    stage: string;
    traceId?: string;
    driverDispatchAttempt: DispatchState;
    callerTimeoutObserved: boolean;
    underlyingSettled: boolean;
    capacityReleased: boolean;
  }>;
  requestScope?: string;
  stage?: string;
  traceId?: string;
  status?: "DISPATCH_CORRELATION_UNKNOWN";
};
type Query = {
  handler: (query: Query) => unknown;
  resolve: (value: unknown) => unknown;
  reject: (error: unknown) => unknown;
};
type LifecycleAdmissionTracker = {
  bindAdmission(query: object | undefined, admissionId: string): void;
  releaseAdmission(admissionId: string): void;
  getAdmissionState(admissionId: string): {
    operationId: string;
    driverDispatchAttempt: DispatchState;
    underlyingSettled: boolean;
  } | undefined;
};
type ActiveAdmission = {
  admissionId: string;
  publicWorkId: string;
  publicWorkIds: string[];
  workKind: PublicWorkKind;
  unit: AdmissionUnit;
  startedAt: number;
  startedAtUtc: string;
  releaseObservationRequired: boolean;
  requestScope: string;
  stage: string;
  traceId?: string;
  callerTimeoutObserved: boolean;
  underlyingSettled: boolean;
  capacityReleased: boolean;
  signal: AbortSignal;
  abortListener: () => void;
  observation?: ReturnType<typeof setTimeout>;
  operatorTimer?: ReturnType<typeof setTimeout>;
};

// Admission is separate from tracing. Never retire, cancel, replay or
// synthetically settle an operation already handed to the driver.
export function boundDatabaseOperations(
  sql: Sql,
  report: (event: AdmissionEvent) => void = () => undefined,
  lifecycle?: LifecycleAdmissionTracker,
): Sql {
  const seen = new WeakSet<object>();
  const clients = new WeakMap<object, Sql>();
  const active = new Map<string, ActiveAdmission>();
  let saturationReported = false;

  function snapshotOldest() {
    const now = performance.now();
    return [...active.values()]
      .sort((a, b) => a.startedAt - b.startedAt)
      .slice(0, SATURATION_SNAPSHOT_LIMIT)
      .map((entry) => {
        entry.releaseObservationRequired = true;
        let queryState: ReturnType<LifecycleAdmissionTracker["getAdmissionState"]>;
        try { queryState = lifecycle?.getAdmissionState(entry.admissionId); } catch { /* diagnostic state is optional */ }
        return {
          admissionId: entry.admissionId,
          operationId: queryState?.operationId,
          publicWorkId: entry.publicWorkId,
          relatedPublicWorkIds: entry.publicWorkIds,
          startedAtUtc: entry.startedAtUtc,
          ageMs: Math.max(0, Math.round(now - entry.startedAt)),
          workKind: entry.workKind,
          unit: entry.unit,
          requestScope: entry.requestScope,
          stage: entry.stage,
          traceId: entry.traceId,
          driverDispatchAttempt: queryState?.driverDispatchAttempt ?? "unknown",
          callerTimeoutObserved: entry.callerTimeoutObserved,
          underlyingSettled: entry.underlyingSettled || queryState?.underlyingSettled === true,
          capacityReleased: entry.capacityReleased,
        };
      });
  }

  function emit(event: AdmissionEvent["event"], entry?: ActiveAdmission, extra: Partial<AdmissionEvent> = {}) {
    try {
      const context = getDbDiagnosticContext();
      let queryState: ReturnType<LifecycleAdmissionTracker["getAdmissionState"]>;
      if (entry) {
        try { queryState = lifecycle?.getAdmissionState(entry.admissionId); } catch { /* diagnostic state is optional */ }
      }
      report({
        event,
        publicInFlight: active.size,
        limit: PUBLIC_DB_WORK_LIMIT,
        workKind: entry?.workKind,
        unit: entry?.unit,
        admissionId: entry?.admissionId,
        publicWorkId: entry?.publicWorkId ?? getPublicDbWork()?.publicWorkId,
        requestScope: entry?.requestScope ?? context?.scope,
        stage: entry?.stage ?? context?.stage,
        traceId: entry?.traceId ?? context?.traceId,
        ...(entry ? {
          operationId: queryState?.operationId,
          ageMs: Math.max(0, Math.round(performance.now() - entry.startedAt)),
          driverDispatchAttempt: queryState?.driverDispatchAttempt ?? "unknown",
          callerTimeoutObserved: entry.callerTimeoutObserved,
          underlyingSettled: entry.underlyingSettled || queryState?.underlyingSettled === true,
          capacityReleased: entry.capacityReleased,
        } : {}),
        ...(event === "transaction_observation" ? { status: "DISPATCH_CORRELATION_UNKNOWN" as const } : {}),
        ...extra,
      });
    } catch { /* logging must never affect admission or SQL */ }
  }

  function admit(unit: AdmissionUnit, query?: object): () => void {
    const context = getPublicDbWork();
    if (!context) return () => undefined;
    if (context.signal.aborted) {
      emit("abandoned_context");
      throw new PublicDbUnavailableError("PUBLIC_DB_ABANDONED");
    }
    if (active.size >= PUBLIC_DB_WORK_LIMIT) {
      if (!saturationReported) {
        saturationReported = true;
        try {
          emit("admission_saturated", undefined, { oldestOperations: snapshotOldest(), snapshotComplete: true });
        } catch {
          emit("admission_saturated", undefined, { snapshotComplete: false });
        }
      }
      throw new PublicDbUnavailableError("PUBLIC_DB_SATURATED");
    }

    const admissionId = randomUUID();
    const diagnosticContext = getDbDiagnosticContext();
    const entry: ActiveAdmission = {
      admissionId,
      publicWorkId: context.publicWorkId,
      publicWorkIds: [...context.parentPublicWorkIds, context.publicWorkId],
      workKind: context.kind,
      unit,
      startedAt: performance.now(),
      startedAtUtc: new Date().toISOString(),
      releaseObservationRequired: false,
      requestScope: diagnosticContext?.scope ?? "unknown",
      stage: diagnosticContext?.stage ?? "unknown",
      traceId: diagnosticContext?.traceId,
      callerTimeoutObserved: context.signal.aborted,
      underlyingSettled: false,
      capacityReleased: false,
      signal: context.signal,
      abortListener: () => { entry.callerTimeoutObserved = true; },
    };
    active.set(admissionId, entry);
    context.signal.addEventListener("abort", entry.abortListener, { once: true });
    try { lifecycle?.bindAdmission(query, admissionId); } catch { /* correlation is best effort */ }

    entry.observation = unit === "transaction"
      ? setTimeout(() => emit("transaction_observation", entry), 10_000)
      : undefined;
    entry.observation?.unref?.();
    entry.operatorTimer = setTimeout(() => emit("operator_action_required", entry), 60_000);
    entry.operatorTimer.unref?.();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.underlyingSettled = true;
      entry.capacityReleased = true;
      clearTimeout(entry.operatorTimer);
      clearTimeout(entry.observation);
      context.signal.removeEventListener("abort", entry.abortListener);
      active.delete(admissionId);
      if (saturationReported || entry.releaseObservationRequired) emit("admission_released", entry);
      try { lifecycle?.releaseAdmission(admissionId); } catch { /* diagnostic state is optional */ }
      if (saturationReported && active.size < PUBLIC_DB_WORK_LIMIT) {
        saturationReported = false;
        emit("admission_available");
      }
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
      try { release = admit("query", q); return Reflect.apply(handler, this, [q]); }
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
