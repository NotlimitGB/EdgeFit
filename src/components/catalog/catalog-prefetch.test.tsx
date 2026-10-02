// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: mocks.prefetch }) }));
import { CatalogPrefetchProvider, useCatalogIntentPrefetch } from "./catalog-prefetch";

function Links({ href }: { href: string }) {
  const handlers = useCatalogIntentPrefetch(href);
  return <>{[1, 2, 3].map((id) => <a key={id} href={href} {...handlers}>{id}</a>)}</>;
}
function mouseEnter(node: Element) {
  fireEvent(node, Object.assign(new Event("pointerover", { bubbles: true }), { pointerType: "mouse" }));
}
beforeEach(() => { vi.useFakeTimers(); mocks.prefetch.mockReset(); Object.defineProperty(navigator, "connection", { configurable: true, value: undefined }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("bounded catalog intent prefetch", () => {
  it("does not prefetch on mount, waits 150ms, cancels on exit, and deduplicates three links", () => {
    const view = render(<CatalogPrefetchProvider><Links href="/boards/one" /></CatalogPrefetchProvider>);
    const links = view.container.querySelectorAll("a");
    expect(mocks.prefetch).not.toHaveBeenCalled();
    mouseEnter(links[0]); vi.advanceTimersByTime(149);
    expect(mocks.prefetch).not.toHaveBeenCalled();
    fireEvent.pointerLeave(links[0]); vi.advanceTimersByTime(1);
    expect(mocks.prefetch).not.toHaveBeenCalled();
    mouseEnter(links[0]); vi.advanceTimersByTime(150);
    mouseEnter(links[1]); vi.advanceTimersByTime(150);
    expect(mocks.prefetch).toHaveBeenCalledExactlyOnceWith("/boards/one");
  });

  it("limits the entire catalog opening to eight URLs, ignores touch and cancels unmount", () => {
    const view = render(<CatalogPrefetchProvider>{Array.from({ length: 10 }, (_, id) => <Links key={id} href={`/boards/${id}`} />)}</CatalogPrefetchProvider>);
    const links = view.container.querySelectorAll("a");
    fireEvent(links[0], Object.assign(new Event("pointerover", { bubbles: true }), { pointerType: "touch" }));
    vi.advanceTimersByTime(150);
    expect(mocks.prefetch).not.toHaveBeenCalled();
    for (let id = 0; id < 10; id++) { mouseEnter(links[id * 3]); vi.advanceTimersByTime(150); }
    expect(mocks.prefetch).toHaveBeenCalledTimes(8);
    view.unmount();
    const pending = render(<CatalogPrefetchProvider><Links href="/boards/pending" /></CatalogPrefetchProvider>);
    mouseEnter(pending.container.querySelector("a")!);
    pending.unmount(); vi.advanceTimersByTime(150);
    expect(mocks.prefetch).toHaveBeenCalledTimes(8);
  });

  it.each([{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "3g" }])("respects constrained connection %j", (connection) => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
    const view = render(<CatalogPrefetchProvider><Links href="/boards/one" /></CatalogPrefetchProvider>);
    mouseEnter(view.container.querySelector("a")!); vi.advanceTimersByTime(150);
    expect(mocks.prefetch).not.toHaveBeenCalled();
  });

  it("prefetches immediately for keyboard focus and swallows failures without changing href", () => {
    mocks.prefetch.mockImplementation(() => { throw new Error("offline"); });
    const view = render(<CatalogPrefetchProvider><Links href="/boards/one" /></CatalogPrefetchProvider>);
    const link = view.container.querySelector("a")!;
    vi.spyOn(link, "matches").mockImplementation((selector) => selector === ":focus-visible");
    fireEvent.focus(link);
    expect(mocks.prefetch).toHaveBeenCalledExactlyOnceWith("/boards/one");
    expect(link.getAttribute("href")).toBe("/boards/one");
  });
});
