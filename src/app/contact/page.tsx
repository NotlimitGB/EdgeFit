import type { Metadata } from "next";
import { SimplePage } from "@/components/site/simple-page";

export const metadata: Metadata = {
  title: "Контакты",
};

export default function ContactPage() {
  return (
    <SimplePage
      title="Контакты"
      text="Для MVP здесь достаточно служебной страницы и контактного адреса. Позже можно добавить форму, интеграцию с почтой и антиспам-защиту."
    />
  );
}
