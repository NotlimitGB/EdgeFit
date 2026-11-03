// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardGallery } from "./board-gallery";

describe("product-photo shutdown", () => {
  it("renders the existing fallback for both base and wide without image requests", () => {
    for (const model of ["Boneless", "Boneless Wide"]) {
      const html = renderToStaticMarkup(<BoardGallery brand="Rome" modelName={model}
        primaryImage="https://example.test/photo.jpg" galleryImages={["https://example.test/other.jpg"]} />);
      expect(html).not.toContain("<img");
      expect(html).not.toContain("example.test");
      expect(html).not.toContain("Фото 1 из");
      expect(html).toContain(model);
      expect(html).toContain("Фото пока не подготовлены");
    }
  });
});
