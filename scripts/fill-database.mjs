import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { загрузитьМоделиВБазу } from "./lib/upsert-boards.mjs";

const адресБазы = process.env.DATABASE_URL;
const режимSsl = process.env.DATABASE_SSL === "disable" ? false : "require";

if (!адресБазы) {
  console.error("Не задана переменная DATABASE_URL в .env.local");
  process.exit(1);
}

const sql = postgres(адресБазы, {
  ssl: режимSsl,
  prepare: false,
  max: 1,
});

const путьКФайлу = path.join(
  process.cwd(),
  "src",
  "data",
  "seed",
  "boards.seed.json",
);
const модели = JSON.parse(await fs.readFile(путьКФайлу, "utf8"));

try {
  await загрузитьМоделиВБазу(sql, модели);
  console.log(`Готово. Загружено моделей: ${модели.length}`);
} finally {
  await sql.end({ timeout: 1 });
}
