import type { Metadata } from "next";
import { SimplePage } from "@/components/site/simple-page";

export const metadata: Metadata = {
  title: "О проекте",
};

export default function AboutPage() {
  return (
    <SimplePage
      title="О проекте EdgeFit"
      text="Мы строим узкий и понятный сервис: помочь райдеру выбрать правильную длину и ширину сноуборда до клика в магазин. В MVP фокус только на этом пути."
    />
  );
}
