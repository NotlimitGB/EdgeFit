import postgres from "postgres";

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

try {
  const результат =
    await sql`select current_database() as "названиеБазы", now() as "времяСервера"`;
  const запись = результат[0];

  console.log(`Подключение успешно. База: ${запись.названиеБазы}`);
  console.log(`Время сервера: ${String(запись.времяСервера)}`);
} finally {
  await sql.end({ timeout: 1 });
}
