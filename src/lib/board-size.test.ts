import { describe, expect, it } from "vitest";
import { getBoardSizeLabel } from "@/lib/board-size";

describe("getBoardSizeLabel", () => {
  it("shows store size labels without cm suffix", () => {
    expect(getBoardSizeLabel({ sizeCm: 161, sizeLabel: "161 cm" })).toBe("161");
    expect(getBoardSizeLabel({ sizeCm: 154, sizeLabel: "154 \u0441\u043c" })).toBe("154");
  });

  it("keeps useful non-unit suffixes like W", () => {
    expect(getBoardSizeLabel({ sizeCm: 160, sizeLabel: "160W" })).toBe("160W");
  });

  it("falls back to sizeCm when sizeLabel is empty", () => {
    expect(getBoardSizeLabel({ sizeCm: 145.5, sizeLabel: null })).toBe("145.5");
  });
});
