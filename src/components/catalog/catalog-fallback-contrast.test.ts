import { readFileSync } from "node:fs";
import postcss from "postcss";
import { expect, it } from "vitest";

const sheet = postcss.parse(
  readFileSync("src/components/catalog/catalog-card.module.css", "utf8"),
);

function declaration(selector: string, property: string) {
  let value: string | undefined;
  sheet.walkRules(selector, (rule) => {
    rule.walkDecls(property, (decl) => { value = decl.value; });
  });
  if (!value) throw new Error(`Missing ${property} on ${selector}`);
  return value;
}

function luminance(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error(`Expected an opaque six-digit sRGB color: ${color}`);
  }
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

it("keeps catalog photo-fallback normal text at WCAG AA contrast", () => {
  const foreground = luminance(declaration(".imageFallback", "color"));
  const background = luminance(declaration(".imageStage", "background"));
  const ratio = (Math.max(foreground, background) + 0.05)
    / (Math.min(foreground, background) + 0.05);

  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
