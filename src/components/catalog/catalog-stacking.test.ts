import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss, { type Container, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = postcss.parse(readFileSync(
  fileURLToPath(new URL("./catalog.module.css", import.meta.url)), "utf8",
));

function value(container: Container, selector: string, property: string) {
  let result: string | undefined;
  container.each((node) => {
    if (node.type !== "rule" || !node.selectors.includes(selector)) return;
    node.walkDecls(property, (declaration) => { result = declaration.value; });
  });
  return result;
}

const desktop = stylesheet.nodes.find((node) =>
  node.type === "atrule" && node.name === "media" && node.params === "(min-width: 640px)",
) as Container;

describe("catalog dropdown stacking contract", () => {
  it("lifts both open parent rows above later rows and width controls only at the floating breakpoint", () => {
    const selectors = [
      ".primaryFilters:has(.multiSelectFieldOpen)",
      ".secondaryFilters:has(.multiSelectFieldOpen)",
    ];
    for (const selector of selectors) {
      const elevatedLayer = Number(value(desktop, selector, "z-index"));
      expect(elevatedLayer).toBe(4);
      for (const sibling of [".primaryFilters", ".secondaryFilters", ".widthFieldset"]) {
        expect(elevatedLayer).toBeGreaterThan(Number(value(stylesheet, sibling, "z-index")));
      }
      const rules: Rule[] = [];
      stylesheet.walkRules((rule) => { if (rule.selectors.includes(selector)) rules.push(rule); });
      expect(rules).toHaveLength(1);
      expect(rules[0].parent).toBe(desktop);
      expect(rules[0].nodes.every((node) => node.type === "decl" && node.prop === "z-index")).toBe(true);
    }
  });

  it("preserves mobile inline expansion, desktop floating geometry and scrolling", () => {
    expect(value(stylesheet, ".multiSelectPanel", "position")).toBe("static");
    expect(value(desktop, ".multiSelectPanel", "position")).toBe("absolute");
    expect(value(desktop, ".multiSelectPanel", "top")).toBe("calc(100% + 0.4rem)");
    expect(value(stylesheet, ".multiSelectPanel", "max-width")).toBe("100%");
    expect(value(stylesheet, ".multiSelectPanel", "overflow-y")).toBe("auto");
    expect(value(stylesheet, ".multiSelectPanel", "max-height")).toBe("min(20rem, 60vh)");
    expect(value(stylesheet, ".filters", "overflow")).toBe("visible");
  });

  it("preserves the opaque panel surface and existing inner layers", () => {
    expect(value(stylesheet, ".multiSelectPanel", "background")).toBe("var(--ef-surface-technical)");
    expect(value(stylesheet, ".multiSelectPanel", "opacity")).toBeUndefined();
    expect(value(stylesheet, ".multiSelectPanel", "z-index")).toBe("5");
    expect(value(stylesheet, ".multiSelectFieldOpen", "z-index")).toBe("4");
  });
});
