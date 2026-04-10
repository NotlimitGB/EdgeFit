import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog/catalog-view";
import { getAllProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Каталог сноубордов",
  description:
    "Живой каталог сноубордов EdgeFit с фильтрами по бренду, стилю, форме, ширине и наличию размеров.",
};

export default async function CatalogPage() {
  const boards = await getAllProducts();

  return (
    <div className="container-shell py-12 sm:py-16">
      <div className="mb-8 max-w-3xl">
        <span className="eyebrow">Живой каталог</span>
        <h1 className="heading-display mt-4 text-4xl font-bold text-balance sm:text-5xl">
          Отдельный просмотр моделей вне квиза
        </h1>
        <p className="mt-4 text-base leading-8 text-[var(--color-muted)] sm:text-lg">
          Здесь уже можно искать модели по бренду и стилю, отсекать лишнее по
          форме и ширине и спокойно просматривать каталог без ощущения, что
          страница пытается выгрузить всё сразу.
        </p>
      </div>

      <CatalogView boards={boards} />
    </div>
  );
}
