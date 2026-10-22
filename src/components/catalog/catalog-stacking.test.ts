import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
const css = readFileSync("src/components/catalog/catalog.module.css", "utf8");
const sheet = postcss.parse(css);
describe("catalog inline facets and top-layer modal layout", () => {
  it("uses inline facets instead of overlapping floating panels", () => {
    expect(css).not.toContain(".multiSelectPanel");
    expect(css).toContain(".facet fieldset");
    expect(css).toContain("overflow:auto");
  });
  it("keeps desktop three columns, tablet two and mobile one", () => {
    expect(css).toContain("grid-template-columns:repeat(3,minmax(0,1fr))");
    expect(css).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
    expect(css).toContain("@media(max-width:599px)");
    expect(css).toContain("grid-template-columns:240px minmax(0,1fr)");
    expect(sheet.nodes.length).toBeGreaterThan(20);
  });
  it("uses native dialog top layer with scrollable content and visible focus", () => {
    expect(css).toContain(".drawer::backdrop");
    expect(css).toContain("height:100dvh");
    expect(css).toContain(".drawerFields");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
  });
});
