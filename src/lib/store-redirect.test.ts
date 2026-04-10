import { describe, expect, it } from "vitest";
import {
  buildTrialSportSearchUrl,
  isPreferredStoreUrl,
  resolveProductStoreUrl,
} from "@/lib/store-redirect";

describe("store redirect helpers", () => {
  it("keeps direct Trial Sport and Traektoria links", () => {
    expect(
      isPreferredStoreUrl("https://trial-sport.ru/goods/51526/2177075.html"),
    ).toBe(true);
    expect(
      isPreferredStoreUrl(
        "https://www.traektoria.ru/product/1890649_snoubord-jones-frontier-2-0/",
      ),
    ).toBe(true);
  });

  it("builds a Trial Sport search fallback for non-store links", () => {
    expect(buildTrialSportSearchUrl("Jones Mountain Twin")).toBe(
      "https://trial-sport.ru/search/?q=Jones+Mountain+Twin",
    );
  });

  it("falls back to a store search when the card still has an official brand URL", () => {
    expect(
      resolveProductStoreUrl({
        affiliateUrl:
          "https://www.jonessnowboards.com/products/men-mountain-twin-snowboard-2026",
        brand: "Jones",
        modelName: "Mountain Twin",
      }),
    ).toBe("https://trial-sport.ru/search/?q=Jones+Mountain+Twin");
  });
});
