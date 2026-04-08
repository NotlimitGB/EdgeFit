import type { Metadata } from "next";
import { InternalAuthBar } from "@/components/internal/internal-auth-bar";
import { CatalogEditor } from "@/components/internal/catalog-editor";
import { SimplePage } from "@/components/site/simple-page";
import { getCatalogProductsForInternalEditor } from "@/lib/internal/catalog-admin";

export const metadata: Metadata = {
  title: "Внутреннее редактирование каталога",
  description:
    "Внутренняя страница EdgeFit для просмотра, редактирования и добавления моделей сноубордов прямо из базы данных.",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function InternalCatalogPage() {
  if (!process.env.DATABASE_URL?.trim()) {
    return (
      <SimplePage
        title="База данных не настроена"
        text="Добавьте DATABASE_URL в окружение проекта, затем перезапустите приложение. После этого здесь откроется внутренняя админ-страница каталога."
      />
    );
  }

  const products = await getCatalogProductsForInternalEditor();

  return (
    <div className="container-shell py-12 sm:py-16">
      <InternalAuthBar />
      <CatalogEditor initialProducts={products} />
    </div>
  );
}
