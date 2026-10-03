import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a href={String(href)} data-prefetch={String(prefetch)} {...props}>{children}</a>,
}));
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import About from "@/app/about/page";

describe("SnowDex public shell", () => {
  it("provides keyboard skip navigation and a native mobile disclosure", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('aria-label="SnowDex — главная"');
    expect(html).toContain('<details');
    expect(html).toContain('<summary aria-label="Открыть навигацию"');
    for (const href of ["/catalog", "/quiz", "/about"]) expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain("EdgeFit");
  });
  it("keeps service and topic links without claiming live merchant availability", () => {
    const html = renderToStaticMarkup(<SiteFooter />);
    for (const href of ["/privacy", "/terms", "/contact", "/kalkulyator-snouborda"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("SnowDex.");
    expect(html).toContain("проверь у продавца");
  });
  it("explains current capabilities, future scope and purchase limitations", () => {
    const html = renderToStaticMarkup(<About />);
    expect(html.match(/<h1\b/gu)).toHaveLength(1);
    expect(html).toContain("Их подбора здесь пока нет");
    expect(html).toContain("SnowDex не продаёт снаряжение");
    expect(html).toContain('href="/quiz"');
    expect(html).toContain('href="/catalog"');
    expect(html).not.toContain("гарантированно");
  });
});
