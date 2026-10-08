import "server-only";
import postgres, { type Sql } from "postgres";
import { базаНастроена, получитьАдресБазы, получитьРежимSsl } from "./config";
import { createDbLifecycleDiagnostics } from "./lifecycle-diagnostics";
import { boundDatabaseOperations } from "./operation-boundary";
import { OperationDeadlineError } from "@/lib/operation-deadline";

let клиентБазы: Sql | null = null;
let recovering = false;

export function получитьКлиентБазы() {
  if (!базаНастроена()) {
    throw new Error("База данных не настроена.");
  }
  // Fail fast until the old client's own sockets close; never overlap generations.
  if (recovering) throw new OperationDeadlineError();

  if (!клиентБазы) {
    const diagnostics = createDbLifecycleDiagnostics();
    const raw = postgres(получитьАдресБазы(), {
      ssl: получитьРежимSsl(),
      prepare: false,
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10,
      debug: diagnostics.debug,
    });
    const generation = diagnostics.wrap(boundDatabaseOperations(raw, () => {
      if (клиентБазы !== generation) return;
      клиентБазы = null;
      recovering = true;
      diagnostics.recovery("client_retired");
      // Close this application's client only. No pg_cancel/terminate_backend.
      void Promise.resolve().then(() => raw.end({ timeout: 0 })).then(() => {
        recovering = false;
        diagnostics.recovery("client_recovery_ready");
      }, () => {
        // Unknown teardown outcome: fail closed, do not overlap client generations.
        diagnostics.recovery("client_recovery_failed");
      });
    }));
    клиентБазы = generation;
  }

  return клиентБазы;
}
