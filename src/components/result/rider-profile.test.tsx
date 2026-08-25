import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildRiderProfile,
  RiderProfile,
} from "@/components/result/rider-profile";
import type { QuizInput } from "@/types/domain";

const input: QuizInput = {
  heightCm: 178,
  weightKg: 74,
  bootSizeEu: 43.5,
  boardLinePreference: "any",
  skillLevel: "intermediate",
  ridingStyle: "freeride",
  terrainPriority: "soft-snow",
  aggressiveness: "balanced",
  stanceType: "unknown",
};

describe("rider profile", () => {
  it("builds all ten values in the fixed three-group order", () => {
    const groups = buildRiderProfile(input, { budgetMaxRub: 60_000 });

    expect(groups.map((group) => group.label)).toEqual([
      "Параметры",
      "Катание",
      "Предпочтения",
    ]);
    expect(groups.flatMap((group) => group.items)).toEqual([
      { key: "heightCm", label: "Рост", value: "178 см" },
      { key: "weightKg", label: "Вес", value: "74 кг" },
      { key: "bootSizeEu", label: "Ботинок", value: "EU 43.5" },
      { key: "stanceType", label: "Стойка", value: "не уверен в стойке" },
      { key: "skillLevel", label: "Уровень", value: "средний уровень" },
      { key: "ridingStyle", label: "Стиль", value: "freeride / powder" },
      { key: "terrainPriority", label: "Приоритет", value: "мягкий снег и разбитка" },
      { key: "aggressiveness", label: "Характер", value: "сбалансированный" },
      { key: "boardLinePreference", label: "Линейка", value: "не важно" },
      { key: "budgetMaxRub", label: "Бюджет", value: "до 60 000 ₽" },
    ]);
  });

  it("shows a truthful value when no budget was provided", () => {
    const groups = buildRiderProfile(input, { budgetMaxRub: null });

    expect(groups[2].items[2]).toEqual({
      key: "budgetMaxRub",
      label: "Бюджет",
      value: "не указан",
    });
  });

  it("renders semantic groups without controls or actions", () => {
    const markup = renderToStaticMarkup(
      <RiderProfile input={input} purchasePreferences={{ budgetMaxRub: null }} />,
    );

    expect(markup.match(/<dl>/g)).toHaveLength(3);
    expect(markup.match(/<dt>/g)).toHaveLength(10);
    expect(markup.match(/<dd>/g)).toHaveLength(10);
    expect(markup.match(/Твой профиль/g)).toHaveLength(1);
    expect(markup).toContain("Исходные данные");
    expect(markup).not.toMatch(/<(?:button|input|select|textarea)\b/u);
  });
});
