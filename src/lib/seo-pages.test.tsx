import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...properties
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => createElement("a", { href, ...properties }, children),
}));

vi.mock("@/components/seo/inline-quiz-launcher", () => ({
  InlineQuizLauncher: () => createElement("div", { "data-inline-quiz": true }),
}));

vi.mock("@/components/result/result-view", () => ({
  ResultView: () => null,
}));

vi.mock("@/lib/saved-results", () => ({
  isSavedResultsEnabled: () => false,
}));

vi.mock("@/lib/canonical-catalog", () => ({
  getAllCanonicalBoardSlugs: vi.fn().mockResolvedValue(["test-board"]),
}));

import { generateMetadata } from "@/app/[seoSlug]/page";
import { metadata as resultMetadata } from "@/app/result/page";
import sitemap from "@/app/sitemap";
import { SeoLandingPageView } from "@/components/seo/landing-page";
import {
  getRelatedSeoLandingPages,
  getSeoLandingPage,
  getSeoLandingPath,
  seoLandingPages,
} from "@/lib/seo-pages";

const originalSlugs = [
  "kalkulyator-snouborda",
  "rostovka-snouborda-po-rostu-i-vesu",
  "kak-vybrat-shirinu-snouborda",
  "snoubord-dlya-bolshogo-razmera-nogi",
  "zatsep-botinkom-na-snouborde",
];

const newPageExpectations = [
  {
    slug: "kak-vybrat-snoubord-novichku",
    title: "Как выбрать сноуборд новичку: размер, жёсткость и прогиб",
    marker: "Начните с веса, роста и рабочего диапазона длины",
    hasComparison: false,
  },
  {
    slug: "zhestkost-snouborda",
    title: "Жёсткость сноуборда: какой flex выбрать под уровень и стиль",
    marker: "Почему цифры flex нельзя сравнивать буквально",
    hasComparison: true,
  },
  {
    slug: "progib-snouborda-camber-rocker",
    title: "Прогиб сноуборда: Camber, Rocker, Flat и Hybrid — что выбрать",
    marker: "Как прогиб меняет контакт со снегом",
    hasComparison: true,
  },
];

describe("SEO landing registry", () => {
  it("contains the five original pages and exactly three choice basics pages", () => {
    expect(seoLandingPages).toHaveLength(8);
    expect(seoLandingPages.map((page) => page.slug)).toEqual(
      expect.arrayContaining(originalSlugs),
    );
    expect(
      newPageExpectations.map(({ slug }) => getSeoLandingPage(slug)?.slug),
    ).toEqual(newPageExpectations.map(({ slug }) => slug));
  });

  it("uses unique slugs and valid explicit topical relationships", () => {
    const slugs = seoLandingPages.map((page) => page.slug);
    const knownSlugs = new Set(slugs);

    expect(new Set(slugs).size).toBe(slugs.length);

    for (const page of seoLandingPages) {
      expect(page.relatedSlugs.length).toBeGreaterThanOrEqual(3);
      expect(page.relatedSlugs.length).toBeLessThanOrEqual(5);
      expect(new Set(page.relatedSlugs).size).toBe(page.relatedSlugs.length);
      expect(page.relatedSlugs).not.toContain(page.slug);
      expect(page.relatedSlugs.every((slug) => knownSlugs.has(slug))).toBe(true);
      expect(getRelatedSeoLandingPages(page).map((item) => item.slug)).toEqual(
        page.relatedSlugs,
      );
    }
  });

  it("resolves declared order defensively without duplicates or invalid pages", () => {
    const beginner = getSeoLandingPage("kak-vybrat-snoubord-novichku");
    expect(beginner).toBeDefined();

    expect(
      getRelatedSeoLandingPages({
        ...beginner!,
        relatedSlugs: [
          "zhestkost-snouborda",
          "missing-page",
          "zhestkost-snouborda",
          beginner!.slug,
          "kalkulyator-snouborda",
        ],
      }).map((page) => page.slug),
    ).toEqual(["zhestkost-snouborda", "kalkulyator-snouborda"]);
  });

  it("keeps the calculator as the only inline quiz landing", () => {
    expect(
      seoLandingPages
        .filter((page) => page.interactiveExperience === "quiz")
        .map((page) => page.slug),
    ).toEqual(["kalkulyator-snouborda"]);
  });
});

describe("choice basics SEO rendering", () => {
  it.each(newPageExpectations)(
    "provides unique metadata and substantive content for $slug",
    async ({ slug, title, marker, hasComparison }) => {
      const page = getSeoLandingPage(slug);
      expect(page).toBeDefined();

      const metadata = await generateMetadata({
        params: Promise.resolve({ seoSlug: slug }),
      });
      const markup = renderToStaticMarkup(
        createElement(SeoLandingPageView, { page: page! }),
      );

      expect(metadata.title).toBe(title);
      expect(metadata.description).toBe(page!.description);
      expect(metadata.alternates?.canonical).toBe(getSeoLandingPath(slug));
      expect(new URL(String(metadata.openGraph?.url)).pathname).toBe(
        getSeoLandingPath(slug),
      );
      expect(markup).toContain(marker);
      expect(markup.match(/<h1\b/gu)).toHaveLength(1);
      expect(markup.includes("<table")).toBe(hasComparison);
      expect(markup).not.toContain("data-inline-quiz");
      expect(markup).toContain('href="/quiz"');
    },
  );

  it("renders semantic comparison rows and explicit related links in declared order", () => {
    const flexPage = getSeoLandingPage("zhestkost-snouborda")!;
    const flexMarkup = renderToStaticMarkup(
      createElement(SeoLandingPageView, { page: flexPage }),
    );

    expect(flexMarkup).toContain('<th scope="col"');
    expect(flexMarkup).toContain('<th scope="row"');
    expect(flexMarkup).toContain("Мягкий");
    expect(flexMarkup).toContain("Жёсткий");

    const beginnerPage = getSeoLandingPage("kak-vybrat-snoubord-novichku")!;
    const beginnerMarkup = renderToStaticMarkup(
      createElement(SeoLandingPageView, { page: beginnerPage }),
    );
    const relatedHrefs = beginnerPage.relatedSlugs.map(
      (slug) => `href="${getSeoLandingPath(slug)}"`,
    );

    relatedHrefs.reduce((previousIndex, href) => {
      const currentIndex = beginnerMarkup.indexOf(href);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      return currentIndex;
    }, -1);
  });

  it("keeps visible FAQ content aligned with FAQPage structured data", () => {
    const page = getSeoLandingPage("progib-snouborda-camber-rocker")!;
    const markup = renderToStaticMarkup(
      createElement(SeoLandingPageView, { page }),
    );

    expect(markup).toContain('"@type":"FAQPage"');
    for (const faq of page.faq) {
      expect(markup).toContain(faq.question);
      expect(markup).toContain(faq.answer);
    }
  });
});

describe("SEO indexing hygiene", () => {
  it("marks the session result noindex while allowing crawlers to follow links", () => {
    expect(resultMetadata.robots).toEqual({ index: false, follow: true });
  });

  it("excludes the session result and includes every SEO landing in sitemap", async () => {
    const entries = await sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);

    expect(paths).not.toContain("/result");
    expect(paths).toContain("/boards/test-board");
    for (const page of seoLandingPages) {
      expect(paths).toContain(getSeoLandingPath(page.slug));
    }
  });
});
