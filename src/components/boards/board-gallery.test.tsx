// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BoardGallery } from "./board-gallery";

afterEach(cleanup);
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
});
