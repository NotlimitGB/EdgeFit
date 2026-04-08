"use client";

import { useDeferredValue, useState } from "react";
import { BoardCard } from "@/components/boards/board-card";
import { boardShapeLabels } from "@/lib/content";
import { получитьОсновнойТипШирины } from "@/lib/product-width";
import type {
  BoardShape,
  Product,
  RidingStyle,
  SkillLevel,
  WidthType,
} from "@/types/domain";

interface CatalogViewProps {
  boards: Product[];
}

type SortKey = "popular" | "price-asc" | "price-desc" | "beginners" | "big-boots";

export function CatalogView({ boards }: CatalogViewProps) {
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState<"all" | RidingStyle>("all");
  const [skill, setSkill] = useState<"all" | SkillLevel>("all");
  const [shape, setShape] = useState<"all" | BoardShape>("all");
  const [width, setWidth] = useState<"all" | WidthType>("all");
  const [sort, setSort] = useState<SortKey>("popular");
  const deferredQuery = useDeferredValue(query);

  const filteredBoards = boards
    .filter((board) => {
      const haystack = `${board.brand} ${board.modelName}`.toLowerCase();
      return haystack.includes(deferredQuery.trim().toLowerCase());
    })
    .filter((board) => (style === "all" ? true : board.ridingStyle === style))
    .filter((board) => (skill === "all" ? true : board.skillLevel === skill))
    .filter((board) => (shape === "all" ? true : board.shapeType === shape))
    .filter((board) => {
      if (width === "all") {
        return true;
      }

      return board.sizes.some((size) => size.widthType === width);
    })
    .sort((left, right) => {
      if (sort === "price-asc") {
        return left.priceFrom - right.priceFrom;
      }

      if (sort === "price-desc") {
        return right.priceFrom - left.priceFrom;
      }

      if (sort === "beginners") {
        return (
          Number(left.skillLevel !== "beginner") -
          Number(right.skillLevel !== "beginner")
        );
      }

      if (sort === "big-boots") {
        const leftWide = Number(
          !left.sizes.some((size) => size.widthType !== "regular"),
        );
        const rightWide = Number(
          !right.sizes.some((size) => size.widthType !== "regular"),
        );
        return leftWide - rightWide;
      }

      return 0;
    });

  return (
    <div className="space-y-8">
      <section className="panel p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="xl:col-span-2">
            <span className="mb-2 block text-sm font-semibold">Поиск по модели</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например, Jones Mountain Twin"
              className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)]"
            />
          </label>

          <SelectField
            label="Стиль"
            value={style}
            onChange={setStyle}
            options={[
              { value: "all", label: "Все стили" },
              { value: "all-mountain", label: "All-mountain" },
              { value: "park", label: "Park / freestyle" },
              { value: "freeride", label: "Freeride" },
            ]}
          />
          <SelectField
            label="Уровень"
            value={skill}
            onChange={setSkill}
            options={[
              { value: "all", label: "Любой уровень" },
              { value: "beginner", label: "Beginner" },
              { value: "intermediate", label: "Intermediate" },
              { value: "advanced", label: "Advanced" },
            ]}
          />
          <SelectField
            label="Форма"
            value={shape}
            onChange={setShape}
            options={[
              { value: "all", label: "Любая форма" },
              { value: "twin", label: boardShapeLabels.twin },
              { value: "asym-twin", label: boardShapeLabels["asym-twin"] },
              {
                value: "directional-twin",
                label: boardShapeLabels["directional-twin"],
              },
              { value: "directional", label: boardShapeLabels.directional },
              {
                value: "tapered-directional",
                label: boardShapeLabels["tapered-directional"],
              },
            ]}
          />
          <SelectField
            label="Сортировка"
            value={sort}
            onChange={setSort}
            options={[
              { value: "popular", label: "По популярности" },
              { value: "price-asc", label: "Сначала дешевле" },
              { value: "price-desc", label: "Сначала дороже" },
              { value: "beginners", label: "Лучшее для новичков" },
              { value: "big-boots", label: "Для больших размеров" },
            ]}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {(["all", "regular", "mid-wide", "wide"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWidth(option)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                width === option
                  ? "bg-[var(--color-pine)] text-white"
                  : "border border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-[var(--color-sky)] hover:text-[var(--color-sky-deep)]"
              }`}
            >
              {option === "all"
                ? "Все по ширине"
                : option === "mid-wide"
                  ? "mid-wide"
                  : option}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
              Каталог
            </p>
            <h2 className="heading-display mt-2 text-3xl font-bold sm:text-4xl">
              {filteredBoards.length} моделей в рабочей выдаче
            </h2>
          </div>
          <p className="hidden max-w-sm text-right text-sm leading-6 text-[var(--color-muted)] md:block">
            Фильтры уже готовы под MVP. Позже сюда можно безболезненно добавить
            цену, бренд и SEO-фасеты.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {filteredBoards.map((board) => (
            <BoardCard
              key={board.id}
              product={board}
              eyebrow={получитьОсновнойТипШирины(board)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: SelectFieldProps<T>) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
