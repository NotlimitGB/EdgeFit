import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import {
  countCatalogSizes,
  parseCatalogCsvTexts,
} from "../src/lib/catalog-import/parse-catalog-csv.mjs";
import { upsertCatalogProducts } from "./lib/upsert-boards.mjs";

const databaseUrl = process.env.DATABASE_URL;
const sslMode = process.env.DATABASE_SSL === "disable" ? false : "require";

if (!databaseUrl) {
  console.error("Не задана переменная DATABASE_URL в .env.local");
  process.exit(1);
}

const modelsFilePath =
  process.env.CSV_MODELS_FILE ??
  process.env.CSV_ФАЙЛ_МОДЕЛЕЙ ??
  path.join(process.cwd(), "src", "data", "csv-import", "models.csv");
const sizesFilePath =
  process.env.CSV_SIZES_FILE ??
  process.env.CSV_ФАЙЛ_РАЗМЕРОВ ??
  path.join(process.cwd(), "src", "data", "csv-import", "sizes.csv");

const sql = postgres(databaseUrl, {
  ssl: sslMode,
  prepare: false,
  max: 1,
});

try {
  const [modelsCsvText, sizesCsvText] = await Promise.all([
    fs.readFile(modelsFilePath, "utf8"),
    fs.readFile(sizesFilePath, "utf8"),
  ]);

  const products = parseCatalogCsvTexts(modelsCsvText, sizesCsvText);
  const summary = await upsertCatalogProducts(sql, products);

  console.log(`Готово. Импортировано моделей: ${summary.importedModels}`);
  console.log(`Импортировано размеров: ${summary.importedSizes ?? countCatalogSizes(products)}`);
  console.log(`Файл моделей: ${modelsFilePath}`);
  console.log(`Файл размеров: ${sizesFilePath}`);
} finally {
  await sql.end({ timeout: 1 });
}
