import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoLandingPageView } from "@/components/seo/landing-page";
import { getSeoLandingPage, getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

export async function generateStaticParams() {
  return seoLandingPages.map((page) => ({
    seoSlug: page.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seoSlug: string }>;
}): Promise<Metadata> {
  const { seoSlug } = await params;
  const page = getSeoLandingPage(seoSlug);

  if (!page) {
    return {};
  }

  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: getSeoLandingPath(page.slug),
    },
    openGraph: {
      title: page.title,
      description: page.description,
      type: "article",
      locale: "ru_RU",
      url: getAbsoluteSiteUrl(`/${page.slug}`),
    },
  };
}

export default async function SeoLandingRoute({
  params,
}: {
  params: Promise<{ seoSlug: string }>;
}) {
  const { seoSlug } = await params;
  const page = getSeoLandingPage(seoSlug);

  if (!page) {
    notFound();
  }

  return <SeoLandingPageView page={page} />;
}
