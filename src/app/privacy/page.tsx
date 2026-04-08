import type { Metadata } from "next";
import { SimplePage } from "@/components/site/simple-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <SimplePage
      title="Privacy Policy"
      text="Страница-заготовка под политику конфиденциальности. Перед запуском здесь нужно описать сбор аналитики, email capture, cookies и партнёрские ссылки."
    />
  );
}
