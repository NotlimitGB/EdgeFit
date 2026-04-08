"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useMemo, useState, useTransition } from "react";

interface ImportResponse {
  message: string;
  importedModels?: number;
  importedSizes?: number;
  modelsFileName?: string;
  sizesFileName?: string;
}

const requiredModelColumns = [
  "slug",
  "brand",
  "model_name",
  "description_short",
  "description_full",
  "riding_style",
  "skill_level",
  "flex",
  "price_from",
  "image_url",
  "affiliate_url",
  "is_active",
  "board_line",
];

const recommendedModelColumns = [
  "data_status",
  "source_name",
  "source_url",
  "source_checked_at",
];

const requiredSizeColumns = [
  "product_slug",
  "size_cm",
  "waist_width_mm",
  "recommended_weight_min",
  "width_type",
];

const optionalSizeColumns = ["size_label", "recommended_weight_max"];

function formatFileSize(file: File | null) {
  if (!file) {
    return "Файл не выбран";
  }

  if (file.size < 1024) {
    return `${file.size} Б`;
  }

  if (file.size < 1024 * 1024) {
    return `${(file.size / 1024).toFixed(1)} КБ`;
  }

  return `${(file.size / (1024 * 1024)).toFixed(1)} МБ`;
}

export function CatalogImportForm() {
  const [modelsFile, setModelsFile] = useState<File | null>(null);
  const [sizesFile, setSizesFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const canSubmit = useMemo(
    () => Boolean(modelsFile && sizesFile && !isPending),
    [isPending, modelsFile, sizesFile],
  );

  function resetStatus() {
    setResult(null);
    setErrorMessage("");
  }

  function handleModelsFileChange(file: File | null) {
    resetStatus();
    setModelsFile(file);
  }

  function handleSizesFileChange(file: File | null) {
    resetStatus();
    setSizesFile(file);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!modelsFile || !sizesFile) {
      setResult(null);
      setErrorMessage("Сначала выберите оба файла: models.csv и sizes.csv.");
      return;
    }

    startTransition(async () => {
      try {
        setResult(null);
        setErrorMessage("");

        const formData = new FormData();
        formData.append("modelsFile", modelsFile);
        formData.append("sizesFile", sizesFile);

        const response = await fetch("/api/catalog-import", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as ImportResponse;

        if (!response.ok) {
          throw new Error(payload.message || "Не удалось загрузить каталог в базу.");
        }

        setResult(payload);
      } catch (error) {
        setResult(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Не удалось загрузить каталог в базу.",
        );
      }
    });
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
      <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <span className="eyebrow">Внутренняя загрузка каталога</span>
            <h1 className="heading-display mt-4 text-4xl font-bold sm:text-5xl">
              Импорт моделей и размеров через браузер
            </h1>
            <p className="mt-4 text-base leading-8 text-[var(--color-muted)] sm:text-lg">
              Эта страница нужна для быстрого обновления каталога без терминала.
              Загрузи два файла: список моделей и список размеров. Сервис проверит
              структуру, а потом полностью обновит размеры по каждому `slug`.
            </p>
          </div>

          <Link
            href="/internal/catalog"
            className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
          >
            Редактировать вручную
          </Link>
        </div>

        <form className="mt-8 grid gap-6" onSubmit={handleSubmit}>
          <FileField
            label="Файл моделей"
            expectedName="models.csv"
            description="Одна строка = одна модель доски."
            file={modelsFile}
            onChange={handleModelsFileChange}
          />

          <FileField
            label="Файл размеров"
            expectedName="sizes.csv"
            description="Одна строка = один размер конкретной модели."
            file={sizesFile}
            onChange={handleSizesFileChange}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-6 py-4 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Загружаем каталог..." : "Загрузить в базу"}
            </button>
            <p className="text-sm leading-7 text-[var(--color-muted)]">
              Шаблоны лежат в `src/data/csv-template/models.csv` и
              `src/data/csv-template/sizes.csv`.
            </p>
          </div>
        </form>

        {errorMessage ? (
          <div className="mt-6 rounded-[1.4rem] border border-[rgba(173,62,55,0.18)] bg-[rgba(173,62,55,0.08)] px-5 py-4 text-sm leading-7 text-[var(--color-danger)]">
            {errorMessage}
          </div>
        ) : null}

        {result ? (
          <div className="mt-6 rounded-[1.6rem] border border-[rgba(24,112,78,0.14)] bg-[rgba(24,112,78,0.08)] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-pine)]">
              Загрузка завершена
            </p>
            <p className="mt-3 text-base font-semibold text-[var(--color-ink)]">
              {result.message}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <ResultStat
                label="Моделей загружено"
                value={String(result.importedModels ?? 0)}
              />
              <ResultStat
                label="Размеров загружено"
                value={String(result.importedSizes ?? 0)}
              />
            </div>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              Файлы: {result.modelsFileName ?? "models.csv"} и{" "}
              {result.sizesFileName ?? "sizes.csv"}
            </p>
          </div>
        ) : null}
      </section>

      <aside className="space-y-5">
        <InfoCard
          title="Что обязательно должно быть в models.csv"
          items={requiredModelColumns}
        />
        <InfoCard
          title="Что желательно добавить для реального каталога"
          items={recommendedModelColumns}
        />
        <InfoCard
          title="Что обязательно должно быть в sizes.csv"
          items={requiredSizeColumns}
        />
        <InfoCard
          title="Что можно добавить в sizes.csv"
          items={optionalSizeColumns}
        />
        <div className="panel p-6">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
            Как работает обновление
          </p>
          <ul className="mt-5 space-y-3 text-sm leading-7 text-[var(--color-muted)]">
            <li>Новые модели добавляются по `slug`.</li>
            <li>Существующие модели обновляются без ручной чистки таблиц.</li>
            <li>Размеры модели пересобираются заново по файлу `sizes.csv`.</li>
            <li>Если бренд пишет только нижнюю границу веса, `recommended_weight_max` можно оставить пустым.</li>
            <li>Если в таблице есть ошибка, база не обновится частично.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function FileField({
  label,
  expectedName,
  description,
  file,
  onChange,
}: {
  label: string;
  expectedName: string;
  description: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <div className="rounded-[1.4rem] border border-[var(--color-border)] bg-white px-4 py-4">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[var(--color-muted)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--color-ice)] file:px-4 file:py-2 file:font-semibold file:text-[var(--color-pine)]"
        />
        <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
          {description} Ожидаемое имя: {expectedName}. Сейчас:{" "}
          {file?.name ?? "не выбрано"} ({formatFileSize(file)}).
        </p>
      </div>
    </label>
  );
}

function InfoCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="panel p-6">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
        {title}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold tracking-[0.04em] text-[var(--color-muted)]"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-[rgba(24,112,78,0.14)] bg-white/78 px-4 py-4">
      <p className="text-sm text-[var(--color-muted)]">{label}</p>
      <p className="mt-2 heading-display text-3xl font-bold text-[var(--color-pine)]">
        {value}
      </p>
    </div>
  );
}
