import "server-only";
import postgres, { type Sql } from "postgres";
import { базаНастроена, получитьАдресБазы, получитьРежимSsl } from "./config";
import { createDbLifecycleDiagnostics } from "./lifecycle-diagnostics";

let клиентБазы: Sql | null = null;

export function получитьКлиентБазы() {
  if (!базаНастроена()) {
    throw new Error("База данных не настроена.");
  }

  if (!клиентБазы) {
    const diagnostics = createDbLifecycleDiagnostics();
    клиентБазы = diagnostics.wrap(postgres(получитьАдресБазы(), {
      ssl: получитьРежимSsl(),
      prepare: false,
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10,
      debug: diagnostics.debug,
    }));
  }

  return клиентБазы;
}
