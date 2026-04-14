import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";
import { getSiteMetadataBase } from "@/lib/site-url";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import "./globals.css";

const bodyFont = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const headingFont = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getSiteMetadataBase(),
  title: {
    default: "EdgeFit",
    template: "%s | EdgeFit",
  },
  description:
    "Русскоязычный сервис подбора сноуборда по росту, весу, размеру ботинка и стилю катания.",
  openGraph: {
    title: "EdgeFit",
    description:
      "Подбор длины, ширины и подходящих моделей сноубордов без магии и перегруза.",
    type: "website",
    locale: "ru_RU",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const yandexMetrikaId = Number(process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID);
  const hasYandexMetrika = Number.isFinite(yandexMetrikaId) && yandexMetrikaId > 0;

  return (
    <html
      lang="ru"
      className={`${bodyFont.variable} ${headingFont.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full bg-[var(--color-snow)] text-[var(--color-ink)]">
        {hasYandexMetrika ? <YandexMetrika counterId={yandexMetrikaId} /> : null}
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(74,136,170,0.14),transparent_38%),linear-gradient(180deg,#f5f9fc_0%,#eef4f8_52%,#f7fbfd_100%)]" />
        <SiteHeader />
        <main className="flex min-h-[calc(100vh-9rem)] flex-col">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
