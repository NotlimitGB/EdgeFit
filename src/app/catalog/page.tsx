import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { CatalogView } from "@/components/catalog/catalog-view";
import { getPublicCanonicalCatalogItems } from "@/lib/public-catalog-cache";
import styles from "@/components/catalog/catalog.module.css";

export const metadata: Metadata = {
  title: "Каталог сноубордов",
  alternates: { canonical: "/catalog" },
  description: "Характеристики моделей сноубордов, записанные ростовки и сохранённые цены. Текущее наличие проверяй у продавца.",
};
export default async function CatalogPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const boards = await getPublicCanonicalCatalogItems();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams ?? {})) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, entry);
  }
  return <div className={styles.catalogPage}><div className={styles.catalogShell}>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>SnowDex / справочник моделей</p><h1>Каталог сноубордов</h1>
        <p className={styles.heroLead}>Характеристики моделей и сохранённые цены. Текущее наличие проверяй у продавца.</p></div>
      <Link href="/quiz" className={styles.secondaryAction}>Подобрать сноуборд <span aria-hidden="true">↗</span></Link>
    </header>
    <CatalogView boards={boards} initialSearch={params.toString()} />
  </div></div>;
}
