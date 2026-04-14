import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog/catalog-view";
import { getAllProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Каталог сноубордов",
  description:
    "Живой каталог сноубордов EdgeFit с фильтрами по бренду, стилю, форме и ширине, плюс простой сортировкой по цене.",
};

export default async function CatalogPage() {
  const boards = await getAllProducts();

  return (
    <div className="container-shell py-12 sm:py-16">
      <div className="mb-8 max-w-3xl">
        <span className="eyebrow">Каталог</span>
        <h1 className="heading-display mt-4 text-4xl font-bold text-balance sm:text-5xl">
          Все модели в каталоге EdgeFit
        </h1>
        <p className="mt-4 text-base leading-8 text-[var(--color-muted)] sm:text-lg">
          Здесь можно спокойно смотреть доски без квиза: фильтровать по бренду,
          стилю, форме и ширине, сравнивать карточки и при необходимости
          отсортировать каталог по цене.
        </p>
      </div>

      <CatalogView boards={boards} />
    </div>
  );
}
