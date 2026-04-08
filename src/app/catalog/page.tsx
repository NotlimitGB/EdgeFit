import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog/catalog-view";
import { получитьВсеМодели } from "@/lib/products";

export const metadata: Metadata = {
  title: "Каталог сноубордов",
  description:
    "Каталог стартовых моделей для EdgeFit с фильтрами по стилю, уровню и ширине.",
};

export default async function CatalogPage() {
  const модели = await получитьВсеМодели();

  return (
    <div className="container-shell py-12 sm:py-16">
      <div className="mb-8 max-w-3xl">
        <span className="eyebrow">Каталог MVP</span>
        <h1 className="heading-display mt-4 text-4xl font-bold text-balance sm:text-5xl">
          Отдельный просмотр моделей вне квиза
        </h1>
        <p className="mt-4 text-base leading-8 text-[var(--color-muted)] sm:text-lg">
          В каталоге уже есть базовый слой для фильтрации и сортировки. На
          следующем этапе сюда можно безболезненно добавить бренд, цены,
          SEO-фасеты и реальные партнёрские данные.
        </p>
      </div>

      <CatalogView boards={модели} />
    </div>
  );
}
