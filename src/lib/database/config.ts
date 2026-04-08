import "server-only";

export function базаНастроена() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function получитьАдресБазы() {
  const адрес = process.env.DATABASE_URL?.trim();

  if (!адрес) {
    throw new Error(
      "Переменная DATABASE_URL не задана. Добавьте её в .env.local.",
    );
  }

  return адрес;
}

export function получитьРежимSsl() {
  return process.env.DATABASE_SSL === "disable" ? false : "require";
}
