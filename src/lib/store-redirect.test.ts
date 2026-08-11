import { describe, expect, it } from "vitest";
import {
  buildStoreRedirectHref,
  buildTrialSportSearchUrl,
  getStoreDestinationPresentation,
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

    const trialSportUrl = "https://trial-sport.ru/goods/51526/2177075.html";
    const traektoriaUrl =
      "https://www.traektoria.ru/product/1890649_snoubord-jones-frontier-2-0/";

    expect(
      resolveProductStoreUrl({
        affiliateUrl: trialSportUrl,
        brand: "Jones",
        modelName: "Frontier",
      }),
    ).toBe(trialSportUrl);
    expect(
      resolveProductStoreUrl({
        affiliateUrl: traektoriaUrl,
        brand: "Jones",
        modelName: "Frontier",
      }),
    ).toBe(traektoriaUrl);
  });

  it.each([
    ["https://traektoria.ru/product/1_board/", "Траектория", "Открыть в Траектории"],
    ["https://www.traektoria.ru/product/1_board/", "Траектория", "Открыть в Траектории"],
    ["https://trial-sport.ru/goods/1.html", "Trial Sport", "Открыть в Trial Sport"],
    ["https://www.trial-sport.ru/goods/1.html", "Trial Sport", "Открыть в Trial Sport"],
  ])(
    "presents supported destination %s as a direct merchant link",
    (affiliateUrl, merchantLabel, actionLabel) => {
      expect(getStoreDestinationPresentation(affiliateUrl)).toEqual({
        mode: "direct",
        merchantLabel,
        actionLabel,
        priceLabel: "Ориентир цены",
        note: "Актуальные цену и наличие проверь в магазине.",
      });
    },
  );

  it.each([
    ["https://example-store.test/board"],
    ["not-a-url"],
    [""],
    [null],
  ])("presents unsupported destination %s as a safe store search", (affiliateUrl) => {
    expect(getStoreDestinationPresentation(affiliateUrl)).toEqual({
      mode: "fallback-search",
      merchantLabel: "Trial Sport",
      actionLabel: "Искать в Trial Sport",
      priceLabel: "Ориентир цены",
      note: "Откроется поиск модели в магазине. Актуальные цену и наличие проверь там.",
    });
  });

  it("does not expose a snapshot merchant in saved-result presentation", () => {
    expect(
      getStoreDestinationPresentation(
        "https://traektoria.ru/product/1_board/",
        "saved",
      ),
    ).toEqual({
      mode: "saved",
      merchantLabel: null,
      actionLabel: "Проверить в магазине",
      priceLabel: "Ориентир цены",
    });
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

  it("serializes canonical display and raw source size labels", () => {
    expect(
      buildStoreRedirectHref({
        productSlug: "bataleon-beyond-medals-wide",
        sizeCm: 161,
        sizeLabel: "161W",
        sourceSizeLabel: "161 cm",
        widthType: "wide",
      }),
    ).toBe(
      "/go/bataleon-beyond-medals-wide?sizeCm=161&sizeLabel=161W&sourceSizeLabel=161+cm&widthType=wide",
    );
  });

  it("does not add a source size label when it is omitted", () => {
    expect(
      buildStoreRedirectHref({
        productSlug: "bataleon-beyond-medals-wide",
        sizeCm: 161,
        sizeLabel: "161W",
        widthType: "wide",
      }),
    ).not.toContain("sourceSizeLabel");
  });

  it("keeps the legacy basic redirect href unchanged", () => {
    expect(buildStoreRedirectHref("slug")).toBe("/go/slug");
  });
});
