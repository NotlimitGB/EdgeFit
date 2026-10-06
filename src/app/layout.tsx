import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { SiteAnalytics } from "@/components/analytics/site-analytics";
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
    default: "SnowDex",
    template: "%s | SnowDex",
  },
  description:
    "Русскоязычный сервис подбора сноуборда по росту, весу, размеру ботинка и стилю катания.",
  openGraph: {
    title: "SnowDex",
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
        <SiteHeader />
        <main id="main-content" className="flex min-h-[calc(100vh-9rem)] flex-col">{children}</main>
        <SiteFooter />
        <SiteAnalytics
          yandexMetrikaId={hasYandexMetrika ? yandexMetrikaId : null}
        />
      </body>
    </html>
  );
}
