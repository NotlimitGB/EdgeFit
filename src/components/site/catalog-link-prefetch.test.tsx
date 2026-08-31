import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: React.ComponentProps<"a"> & {
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/analytics/mount-event", () => ({
  MountEvent: () => null,
}));

vi.mock("@/components/seo/inline-quiz-launcher", () => ({
  InlineQuizLauncher: () => null,
}));

import Home from "@/app/page";
import { SeoLandingPageView } from "@/components/seo/landing-page";
import { SiteHeader } from "@/components/site/site-header";
import { seoLandingPages } from "@/lib/seo-pages";

function getCatalogLinks(markup: string) {
  return Array.from(
    markup.matchAll(/<a\b[^>]*href="\/catalog"[^>]*>/g),
    ([link]) => link,
  );
}

function expectCatalogPrefetchDisabled(markup: string, count: number) {
  const links = getCatalogLinks(markup);

  expect(links).toHaveLength(count);
  expect(links.every((link) => link.includes('data-prefetch="false"'))).toBe(
    true,
  );
}

describe("direct catalog navigation", () => {
  it("disables only the catalog navigation item in the global header", () => {
    const markup = renderToStaticMarkup(<SiteHeader />);

    expectCatalogPrefetchDisabled(markup, 1);
    expect(markup.match(/data-prefetch="false"/g)).toHaveLength(1);
  });

  it("disables prefetch for the homepage catalog CTA", () => {
    expectCatalogPrefetchDisabled(renderToStaticMarkup(<Home />), 1);
  });

  it("disables prefetch for both catalog links in the SEO template", () => {
    const page = seoLandingPages.find(
      (candidate) => candidate.interactiveExperience !== "quiz",
    );

    expect(page).toBeDefined();
    expectCatalogPrefetchDisabled(
      renderToStaticMarkup(<SeoLandingPageView page={page!} />),
      2,
    );
  });
});
