// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pathname: "/", prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: mocks.prefetch }), usePathname: () => mocks.pathname }));
vi.mock("next/link", () => ({ default: ({ href, prefetch, children, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) =>
  <a {...props} href={String(href)} data-prefetch={String(prefetch)}>{children}</a> }));
let Entry: typeof import("./catalog-entry-link").CatalogEntryLink;
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); mocks.pathname = "/"; mocks.prefetch.mockReset();
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
  Entry = (await import("./catalog-entry-link")).CatalogEntryLink;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
function enter(node: HTMLElement, pointerType = "mouse") {
  const event = new Event("pointerover", { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType }); fireEvent(node, event);
}
it("never prefetches on mount, deduplicates all entry points after 150ms and preserves href", () => {
  render(<><Entry>Header</Entry><Entry>Home</Entry></>);
  vi.advanceTimersByTime(1000); expect(mocks.prefetch).not.toHaveBeenCalled();
  const header = screen.getByText("Header"); expect(header.getAttribute("href")).toBe("/catalog");
  expect(header.getAttribute("data-prefetch")).toBe("false");
  enter(header); vi.advanceTimersByTime(149); expect(mocks.prefetch).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(mocks.prefetch).toHaveBeenCalledExactlyOnceWith("/catalog");
  enter(screen.getByText("Home")); vi.advanceTimersByTime(200); expect(mocks.prefetch).toHaveBeenCalledTimes(1);
});
it("cancels hover on leave/unmount and ignores touch scroll", () => {
  const view = render(<Entry>Catalog</Entry>); const link = screen.getByText("Catalog");
  enter(link); fireEvent.pointerOut(link); vi.advanceTimersByTime(200); expect(mocks.prefetch).not.toHaveBeenCalled();
  enter(link, "touch"); vi.advanceTimersByTime(200); expect(mocks.prefetch).not.toHaveBeenCalled();
  enter(link); view.unmount(); vi.advanceTimersByTime(200); expect(mocks.prefetch).not.toHaveBeenCalled();
});
it("prefetches on keyboard focus without preventing navigation when speculation fails", () => {
  mocks.prefetch.mockImplementation(() => { throw new Error("offline"); });
  render(<Entry>Catalog</Entry>); const link = screen.getByText("Catalog");
  vi.spyOn(link, "matches").mockReturnValue(true); fireEvent.focus(link);
  expect(mocks.prefetch).toHaveBeenCalledExactlyOnceWith("/catalog"); expect(link.getAttribute("href")).toBe("/catalog");
});
it.each([{ saveData: true }, { effectiveType: "3g" }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }])("respects connection guard %j", (connection) => {
  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
  render(<Entry>Catalog</Entry>); enter(screen.getByText("Catalog")); vi.advanceTimersByTime(200);
  expect(mocks.prefetch).not.toHaveBeenCalled();
});
it("does not prefetch the already open catalog", () => {
  mocks.pathname = "/catalog"; render(<Entry>Catalog</Entry>); enter(screen.getByText("Catalog")); vi.advanceTimersByTime(200);
  expect(mocks.prefetch).not.toHaveBeenCalled();
});

it("handles rejected speculation without retries or intercepted clicks", async () => {
  mocks.prefetch.mockRejectedValue(new Error("offline"));
  render(<Entry>Catalog</Entry>); const link = screen.getByText("Catalog");
  enter(link); vi.advanceTimersByTime(150); await Promise.resolve();
  enter(link); vi.advanceTimersByTime(150);
  expect(mocks.prefetch).toHaveBeenCalledTimes(1);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(click); expect(click.defaultPrevented).toBe(false);
});
