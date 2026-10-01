import type { Metadata } from "next";
import { SimplePage } from "@/components/site/simple-page";

export const metadata: Metadata = {
  title: "Terms",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <SimplePage
      title="Terms"
      text="Страница-заготовка под условия использования. До публичного запуска здесь нужно обозначить ограничения сервиса и то, что рекомендации не заменяют консультацию магазина."
    />
  );
}
