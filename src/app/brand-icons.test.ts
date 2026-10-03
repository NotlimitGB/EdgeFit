import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file));
const orange = [191, 70, 12];
const paths = ["M3 25 12 7l5 10 4-7 8 15H3Z", "m9 20 3-6 3 6h-6Zm10 0 2-4 2 4h-4Z"];

describe("SnowDex icon pack", () => {
  it("keeps the existing header geometry with explicit brand colors", () => {
    const svg = read("src/app/icon.svg").toString();
    const header = read("src/components/site/site-header.tsx").toString();
    for (const geometry of paths) {
      expect(svg).toContain(`d="${geometry}"`);
      expect(header).toContain(`d="${geometry}"`);
    }
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('fill="#bf460c"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toMatch(/currentColor|gradient|https?:\/\/(?!www\.w3\.org)|script|<image/);
  });

  it("is a compact real ICO with independently rendered 16/32/48 PNG frames", async () => {
    const ico = read("src/app/favicon.ico");
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect(ico.length).toBeLessThan(30_000);
    let offset = 54;
    for (const [index, size] of [16, 32, 48].entries()) {
      const entry = 6 + index * 16;
      expect([ico[entry], ico[entry + 1]]).toEqual([size, size]);
      expect(ico.readUInt16LE(entry + 4)).toBe(1);
      expect(ico.readUInt16LE(entry + 6)).toBe(32);
      expect(ico.readUInt32LE(entry + 12)).toBe(offset);
      const length = ico.readUInt32LE(entry + 8);
      const frame = ico.subarray(offset, offset + length);
      const metadata = await sharp(frame).metadata();
      expect([metadata.format, metadata.width, metadata.height, metadata.hasAlpha])
        .toEqual(["png", size, size, true]);
      const expected = await sharp(read("src/app/icon.svg"), { density: size * 72 / 32 })
        .resize(size, size).flatten({ background: "#bf460c" }).ensureAlpha().png().toBuffer();
      const pixels = await sharp(frame).raw().toBuffer();
      for (let alpha = 3; alpha < pixels.length; alpha += 4) expect(pixels[alpha]).toBe(255);
      expect(frame.equals(expected)).toBe(true);
      offset += length;
    }
    expect(offset).toBe(ico.length);
  });

  it.each([
    ["src/app/apple-icon.png", 180],
    ["public/icons/snowdex-192.png", 192],
    ["public/icons/snowdex-512.png", 512],
  ] as const)("has an opaque square launcher with mask-safe padding: %s", async (file, size) => {
    const source = read(file);
    const metadata = await sharp(source).metadata();
    expect([metadata.format, metadata.width, metadata.height, metadata.hasAlpha])
      .toEqual(["png", size, size, false]);
    const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * size + x) * info.channels, (y * size + x) * info.channels + 3)];
    for (const x of [0, size - 1]) for (const y of [0, size - 1]) expect(pixel(x, y)).toEqual(orange);
    let markPixels = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (pixel(x, y).every((value, index) => value === orange[index])) continue;
      markPixels++;
      expect(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)).toBeLessThanOrEqual(size * 0.4);
    }
    expect(markPixels).toBeGreaterThan(size * size * 0.1);
  });

  it("uses only the two launcher assets in a browser-mode manifest", () => {
    const manifest = JSON.parse(read("src/app/manifest.json").toString());
    expect(manifest).toEqual({
      name: "SnowDex", short_name: "SnowDex", start_url: "/", scope: "/", display: "browser",
      background_color: "#bf460c", theme_color: "#bf460c",
      icons: [
        { src: "/icons/snowdex-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/snowdex-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    });
    for (const icon of manifest.icons) expect(read(`public${icon.src}`).length).toBeGreaterThan(0);
  });
});
