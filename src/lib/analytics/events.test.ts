import { describe, expect, it } from "vitest";
import { analyticsEvents, getYandexGoalNames } from "@/lib/analytics/events";

describe("getYandexGoalNames", () => {
  it("returns the base Yandex goal for a product click", () => {
    expect(getYandexGoalNames(analyticsEvents.productClicked)).toEqual([
      "edgefit_product_clicked",
    ]);
  });

  it("adds a dedicated board-page goal for product clicks from a model page", () => {
    expect(
      getYandexGoalNames(analyticsEvents.productClicked, {
        placement: "board-page",
      }),
    ).toEqual([
      "edgefit_product_clicked",
      "edgefit_product_clicked_board_page",
    ]);
  });

  it("does not add the board-page goal for other placements", () => {
    expect(
      getYandexGoalNames(analyticsEvents.productClicked, {
        placement: "catalog",
      }),
    ).toEqual(["edgefit_product_clicked"]);
  });
});
