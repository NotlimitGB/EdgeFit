import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LEGACY_CANONICAL_BOARD_SLUG_ALIASES } from "@/lib/canonical-board-route";
import { getPublicCanonicalCatalogItems } from "@/lib/public-catalog-cache";
import type { PublicCatalogItem } from "@/lib/public-catalog-dto";

export const metadata: Metadata = {
  title: "Модели сноубордов по брендам",
  description: "Алфавитный справочник моделей сноубордов со ссылками на характеристики и ростовки каждой доски.",
  alternates: { canonical: "/catalog/models" },
};

const alphabetical = new Intl.Collator("ru", { sensitivity: "base", numeric: true });

export default async function ModelsDirectoryPage() {
  await connection();
  const catalog = await getPublicCanonicalCatalogItems();
  const models = new Map<string, PublicCatalogItem>();
  for (const model of catalog) {
    if (!Object.hasOwn(LEGACY_CANONICAL_BOARD_SLUG_ALIASES, model.slug)) models.set(model.slug, model);
  }
  const byBrand = new Map<string, PublicCatalogItem[]>();
  for (const model of [...models.values()].sort((left, right) =>
    alphabetical.compare(left.brand, right.brand) || left.brand.localeCompare(right.brand, "ru") ||
    alphabetical.compare(left.modelName, right.modelName) ||
    alphabetical.compare(left.seasonLabel ?? "", right.seasonLabel ?? "") || left.slug.localeCompare(right.slug, "en"),
  )) {
    const brand = byBrand.get(model.brand) ?? [];
    brand.push(model);
    byBrand.set(model.brand, brand);
  }

  return (
    <div className="container-shell py-8 sm:py-12">
      <Link href="/catalog" prefetch={false} className="text-sm underline underline-offset-4">Каталог с фильтрами</Link>
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Модели сноубордов по брендам</h1>
      <p className="mt-3 text-[var(--color-muted)]">
        Выбери модель, чтобы посмотреть характеристики, сезон и записанные ростовки.
      </p>
      {byBrand.size === 0 && <p className="mt-6">В каталоге пока нет моделей.</p>}
      {[...byBrand].map(([brand, entries]) => (
        <section key={brand} className="mt-7 border-t border-[var(--color-border)] pt-4">
          <h2 className="text-xl font-semibold break-words">{brand}</h2>
          <ul className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((model) => (
              <li key={model.slug} className="min-w-0">
                <a href={`/boards/${encodeURIComponent(model.slug)}`} className="inline-block break-words py-1 text-[var(--color-sky-deep)] underline underline-offset-4">
                  {model.modelName}{model.seasonLabel ? ` · ${model.seasonLabel}` : ""}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
