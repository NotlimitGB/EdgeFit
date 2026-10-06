// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pathname: "/", prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ prefetch: mocks.prefetch }) }));
vi.mock("next/link", () => ({ default: ({ href, prefetch, children, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) =>
  <a href={String(href)} data-prefetch={String(prefetch)} {...props}>{children}</a> }));
import { SiteHeader } from "./site-header";

beforeEach(() => { mocks.pathname = "/"; mocks.prefetch.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function menu() {
  const nav = screen.getByRole("navigation", { name: "Мобильная навигация", hidden: true });
  return { nav, details: nav.closest("details")!, summary: nav.closest("details")!.querySelector("summary")! };
}

describe("native mobile menu navigation", () => {
  it.each([["Главная", "/"], ["Каталог", "/catalog"], ["О SnowDex", "/about"], ["Подбор сноуборда", "/quiz"]])(
    "closes on %s, preserves navigation, and reopens on the persistent header", async (label, href) => {
      const user = userEvent.setup();
      const view = render(<SiteHeader />);
      const { nav, details, summary } = menu();
      expect(details.open).toBe(false);
      await user.click(summary); expect(details.open).toBe(true);
      const link = within(nav).getByText(label);
      expect(link.getAttribute("href")).toBe(href);
      if (href === "/catalog") expect(link.getAttribute("data-prefetch")).toBe("false");
      link.focus();
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      fireEvent(link, event);
      expect(event.defaultPrevented).toBe(false);
      expect(details.open).toBe(false);
      expect(document.activeElement).toBe(summary);
      mocks.pathname = href; view.rerender(<SiteHeader />);
      expect(menu().details).toBe(details);
      await user.click(summary); expect(details.open).toBe(true);
      await user.click(summary); expect(details.open).toBe(false);
      await user.click(summary); await user.click(link); expect(details.open).toBe(false);
    });

  it("closes for external route changes/history but not an unchanged rerender", async () => {
    const user = userEvent.setup(); const view = render(<SiteHeader />);
    const { details, summary } = menu();
    await user.click(summary); view.rerender(<SiteHeader />); expect(details.open).toBe(true);
    mocks.pathname = "/about"; view.rerender(<SiteHeader />); expect(details.open).toBe(false);
    await user.click(summary); mocks.pathname = "/"; view.rerender(<SiteHeader />); expect(details.open).toBe(false);
  });

  it("supports keyboard link activation without hidden focus", async () => {
    const user = userEvent.setup(); render(<SiteHeader />);
    const { nav, details, summary } = menu(); summary.focus();
    // jsdom does not implement the summary's native keyboard default action.
    // Real Enter/Space disclosure activation is covered in the browser check.
    await user.click(summary); expect(details.open).toBe(true);
    within(nav).getByText("О SnowDex").focus(); await user.keyboard("{Enter}");
    expect(details.open).toBe(false); expect(document.activeElement).toBe(summary);
    await user.click(summary); expect(details.open).toBe(true);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
    "leaves modified activation unchanged: %j", (options) => {
      render(<SiteHeader />); const { nav, details } = menu(); details.open = true;
      fireEvent.click(within(nav).getByText("Каталог"), options); expect(details.open).toBe(true);
    });

  it("does not close on non-link interaction or steal focus outside the menu", () => {
    const view = render(<SiteHeader />); const { nav, details } = menu(); details.open = true;
    fireEvent.click(nav); expect(details.open).toBe(true);
    const brand = screen.getByRole("link", { name: "SnowDex — главная" }); brand.focus();
    mocks.pathname = "/quiz"; view.rerender(<SiteHeader />);
    expect(details.open).toBe(false); expect(document.activeElement).toBe(brand);
  });
});
