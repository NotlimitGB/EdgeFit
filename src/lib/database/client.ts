import "server-only";
import postgres, { type Sql } from "postgres";
import { базаНастроена, получитьАдресБазы, получитьРежимSsl } from "./config";

let клиентБазы: Sql | null = null;

export function получитьКлиентБазы() {
  if (!базаНастроена()) {
    throw new Error("База данных не настроена.");
  }

  if (!клиентБазы) {
    клиентБазы = postgres(получитьАдресБазы(), {
      ssl: получитьРежимSsl(),
      prepare: false,
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10,
    });
  }

  return клиентБазы;
}
