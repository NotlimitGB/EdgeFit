// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { BoardGallery } from "./board-gallery";

const originalComplete = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "complete",
);
const originalNaturalWidth = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "naturalWidth",
);
const hydrationRoots: Array<{
  container: HTMLElement;
  root: ReturnType<typeof hydrateRoot>;
}> = [];

afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const { root } of hydrationRoots) {
      root.unmount();
    }
  });
  for (const { container } of hydrationRoots) {
    container.remove();
  }
  hydrationRoots.length = 0;
  if (originalComplete) {
    Object.defineProperty(HTMLImageElement.prototype, "complete", originalComplete);
  }
  if (originalNaturalWidth) {
    Object.defineProperty(
      HTMLImageElement.prototype,
      "naturalWidth",
      originalNaturalWidth,
    );
  }
});
describe("board gallery keyboard presentation", () => {
  it("prioritizes only the main image and keeps thumbnails lazy", () => {
    const view = render(<BoardGallery brand="Ride" modelName="Warpig" primaryImage="/test-front.svg" galleryImages={["/test-back.svg"]} />);
    const images = [...view.container.querySelectorAll("img")];
    expect(images.filter((image) => image.getAttribute("fetchpriority") === "high")).toHaveLength(1);
    expect(images[0].getAttribute("loading")).toBe("eager");
    expect(images[0].getAttribute("decoding")).toBe("async");
    for (const thumbnail of images.slice(1)) expect(thumbnail.getAttribute("loading")).toBe("lazy");
  });
  it("opens with focus, traps tab and restores focus and scroll on Escape", () => {
    render(<BoardGallery brand="Ride" modelName="Warpig" primaryImage="/test-front.svg" galleryImages={["/test-back.svg"]} />);
    const trigger = screen.getByRole("button", { name: "Открыть фото в полном размере" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Закрыть" });
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    const last = within(dialog).getByRole("button", { name: "Показать фото 2" });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(within(dialog).getByRole("img").getAttribute("src")).toBe("/test-back.svg");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });
  it("keeps an honest fallback for missing media", () => {
    render(<BoardGallery brand="Ride" modelName="Warpig" primaryImage="" />);
    expect(screen.getByText("Фото пока не подготовлены")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("recovers an image that failed before hydration", async () => {
    const failedUrls = new Set(["/failed-before-hydration.jpg"]);
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get() {
        return failedUrls.has(this.getAttribute("src") ?? "");
      },
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get() {
        return 0;
      },
    });

    const props = {
      brand: "Rome",
      modelName: "BONELESS",
      primaryImage: "/failed-before-hydration.jpg",
      galleryImages: ["/valid-second-image.jpg"],
    };
    const container = document.createElement("div");
    container.innerHTML = renderToString(<BoardGallery {...props} />);
    document.body.append(container);
    const root = hydrateRoot(container, <BoardGallery {...props} />);
    hydrationRoots.push({ container, root });

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('button[aria-label="Открыть фото в полном размере"] img')
        ?.getAttribute("src"),
    ).toBe("/valid-second-image.jpg");
    expect(
      [...container.querySelectorAll("img")].some((image) =>
        failedUrls.has(image.getAttribute("src") ?? ""),
      ),
    ).toBe(false);
  });

  it("shows the honest fallback when every SSR image failed before hydration", async () => {
    const failedUrls = new Set(["/failed-primary.jpg", "/failed-gallery.jpg"]);
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get() {
        return failedUrls.has(this.getAttribute("src") ?? "");
      },
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get() {
        return 0;
      },
    });

    const props = {
      brand: "Rome",
      modelName: "BONELESS",
      primaryImage: "/failed-primary.jpg",
      galleryImages: ["/failed-gallery.jpg"],
    };
    const container = document.createElement("div");
    container.innerHTML = renderToString(<BoardGallery {...props} />);
    document.body.append(container);
    const root = hydrateRoot(container, <BoardGallery {...props} />);
    hydrationRoots.push({ container, root });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.textContent).toContain("Фото модели не удалось загрузить");
  });

  it("closes the viewer and restores scroll when its last image fails", () => {
    render(
      <BoardGallery
        brand="Rome"
        modelName="BONELESS"
        primaryImage="/only-image.jpg"
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Открыть фото в полном размере",
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    fireEvent.error(within(dialog).getByRole("img"));

    expect(screen.queryByRole("dialog")).toBeNull();
    const fallback = screen.getByText("Фото модели не удалось загрузить").parentElement;
    expect(fallback).toBeTruthy();
    expect(document.activeElement).toBe(fallback);
    expect(document.body.style.overflow).toBe("");
  });
});
