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

const existingSlugs = [
  "kalkulyator-snouborda",
  "rostovka-snouborda-po-rostu-i-vesu",
  "kak-vybrat-shirinu-snouborda",
  "snoubord-dlya-bolshogo-razmera-nogi",
  "zatsep-botinkom-na-snouborde",
  "kak-vybrat-snoubord-novichku",
  "zhestkost-snouborda",
  "progib-snouborda-camber-rocker",
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

const ridingStylePageExpectations = [
  {
    slug: "snoubord-dlya-frirayda",
    title: "Сноуборд для фрирайда: как выбрать длину, форму и прогиб",
    description:
      "Как выбрать сноуборд для фрирайда: рабочая длина, directional-форма, flex и профиль под мягкий снег без универсальных формул.",
    marker: "Параметры доски не заменяют решения о безопасности",
    hasComparison: false,
  },
  {
    slug: "snoubord-dlya-karvinga",
    title: "Сноуборд для карвинга: как выбрать ширину, жёсткость и прогиб",
    description:
      "Как выбрать сноуборд для карвинга: ширина и boot clearance, flex, профиль, длина и форма для трассы и чистой дуги.",
    marker: "Что EdgeFit не рассчитывает",
    hasComparison: true,
  },
  {
    slug: "snoubord-dlya-parka-i-fristayla",
    title: "Сноуборд для парка и фристайла: как выбрать форму, flex и длину",
    description:
      "Как выбрать сноуборд для парка и фристайла: twin-форма, flex, рабочая длина и профиль для switch, фигур, прыжков и трассы.",
    marker: "Парк — это несколько разных сценариев",
    hasComparison: false,
  },
];

describe("SEO landing registry", () => {
  it("preserves the eight existing pages and adds exactly three riding-style pages", () => {
    expect(seoLandingPages).toHaveLength(11);
    expect(seoLandingPages.map((page) => page.slug)).toEqual(
      expect.arrayContaining(existingSlugs),
    );
    expect(
      ridingStylePageExpectations.map(({ slug }) => getSeoLandingPage(slug)?.slug),
    ).toEqual(ridingStylePageExpectations.map(({ slug }) => slug));
    expect(getSeoLandingPage("snoubord-all-mountain")).toBeUndefined();
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

  it("uses the intended narrow riding-style relationships and backlinks", () => {
    expect(getSeoLandingPage("snoubord-dlya-frirayda")?.relatedSlugs).toEqual([
      "rostovka-snouborda-po-rostu-i-vesu",
      "zhestkost-snouborda",
      "progib-snouborda-camber-rocker",
      "kalkulyator-snouborda",
    ]);
    expect(getSeoLandingPage("snoubord-dlya-karvinga")?.relatedSlugs).toEqual([
      "kak-vybrat-shirinu-snouborda",
      "zatsep-botinkom-na-snouborde",
      "zhestkost-snouborda",
      "progib-snouborda-camber-rocker",
      "kalkulyator-snouborda",
    ]);
    expect(getSeoLandingPage("snoubord-dlya-parka-i-fristayla")?.relatedSlugs).toEqual([
      "zhestkost-snouborda",
      "progib-snouborda-camber-rocker",
      "kak-vybrat-snoubord-novichku",
      "kalkulyator-snouborda",
    ]);

    expect(
      getSeoLandingPage("rostovka-snouborda-po-rostu-i-vesu")?.relatedSlugs.at(-1),
    ).toBe("snoubord-dlya-frirayda");
    expect(getSeoLandingPage("kak-vybrat-shirinu-snouborda")?.relatedSlugs.at(-1)).toBe(
      "snoubord-dlya-karvinga",
    );
    expect(getSeoLandingPage("zatsep-botinkom-na-snouborde")?.relatedSlugs.at(-1)).toBe(
      "snoubord-dlya-karvinga",
    );
    expect(getSeoLandingPage("zhestkost-snouborda")?.relatedSlugs.at(-1)).toBe(
      "snoubord-dlya-parka-i-fristayla",
    );
    expect(getSeoLandingPage("progib-snouborda-camber-rocker")?.relatedSlugs.slice(-2)).toEqual([
      "snoubord-dlya-frirayda",
      "snoubord-dlya-parka-i-fristayla",
    ]);
  });

  it("keeps every title and description unique", () => {
    expect(new Set(seoLandingPages.map((page) => page.title)).size).toBe(
      seoLandingPages.length,
    );
    expect(new Set(seoLandingPages.map((page) => page.description)).size).toBe(
      seoLandingPages.length,
    );
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

describe("riding-style SEO rendering", () => {
  it.each(ridingStylePageExpectations)(
    "provides distinct metadata and substantive content for $slug",
    async ({ slug, title, description, marker, hasComparison }) => {
      const page = getSeoLandingPage(slug);
      expect(page).toBeDefined();

      const metadata = await generateMetadata({
        params: Promise.resolve({ seoSlug: slug }),
      });
      const markup = renderToStaticMarkup(
        createElement(SeoLandingPageView, { page: page! }),
      );

      expect(metadata.title).toBe(title);
      expect(metadata.description).toBe(description);
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

  it("renders the carving capability boundary as a semantic comparison", () => {
    const carvingPage = getSeoLandingPage("snoubord-dlya-karvinga")!;
    const markup = renderToStaticMarkup(
      createElement(SeoLandingPageView, { page: carvingPage }),
    );

    expect(markup).toContain('<th scope="col"');
    expect(markup).toContain('<th scope="row"');
    expect(markup).toContain("Sidecut radius и effective edge");
    expect(markup).toContain("EdgeFit не рассчитывает эти параметры");
    expect(markup).toContain("hardboot compatibility");
    expect(markup).toContain("race/alpine geometry");
  });

  it.each(ridingStylePageExpectations)(
    "keeps visible FAQ aligned with structured data for $slug",
    ({ slug }) => {
      const page = getSeoLandingPage(slug)!;
      const markup = renderToStaticMarkup(
        createElement(SeoLandingPageView, { page }),
      );

      expect(markup).toContain('"@type":"Article"');
      expect(markup).toContain('"@type":"FAQPage"');
      for (const faq of page.faq) {
        expect(markup).toContain(faq.question);
        expect(markup).toContain(faq.answer);
      }
    },
  );
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
