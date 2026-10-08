import "server-only";
import postgres, { type Sql } from "postgres";
import { базаНастроена, получитьАдресБазы, получитьРежимSsl } from "./config";
import { createDbLifecycleDiagnostics } from "./lifecycle-diagnostics";
import { boundDatabaseOperations } from "./operation-boundary";

let клиентБазы: Sql | null = null;

export function получитьКлиентБазы() {
  if (!базаНастроена()) {
    throw new Error("База данных не настроена.");
  }

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
    // One application client per process. end() is not proof of socket closure;
    // caller deadlines must never replace this generation.
    клиентБазы = diagnostics.wrap(boundDatabaseOperations(raw, diagnostics.boundary));
  }

  return клиентБазы;
}
