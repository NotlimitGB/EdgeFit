import type { Metadata } from "next";
import { InternalAuthBar } from "@/components/internal/internal-auth-bar";
import { CatalogImportForm } from "@/components/internal/catalog-import-form";

export const metadata: Metadata = {
  title: "Внутренняя загрузка каталога",
  description:
    "Внутренняя страница EdgeFit для загрузки моделей и размеров сноубордов из CSV в базу данных.",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default function InternalImportPage() {
  return (
    <div className="container-shell py-12 sm:py-16">
      <InternalAuthBar />
      <CatalogImportForm />
    </div>
  );
}
