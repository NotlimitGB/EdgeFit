"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  boardShapeLabels,
  formatMoney,
  productDataStatusLabels,
  ridingStyleLabels,
  skillLevelLabels,
  widthTypeLabels,
} from "@/lib/content";
import {
  getProductCatalogIssues,
  isReadyForCatalog,
} from "@/lib/catalog-readiness";
import type {
  Product,
  BoardShape,
  ProductDataStatus,
  RidingStyle,
  SkillLevel,
  WidthType,
} from "@/types/domain";

interface CatalogEditorProps {
  initialProducts: Product[];
}

interface SaveResponse {
  message: string;
  product?: Product;
}

interface ProductSizeDraft {
  draftId: string;
  sizeCm: string;
  sizeLabel: string;
  waistWidthMm: string;
  recommendedWeightMin: string;
  recommendedWeightMax: string;
  widthType: WidthType;
}

interface ProductDraft {
  id: string;
  slug: string;
  brand: string;
  modelName: string;
  descriptionShort: string;
  descriptionFull: string;
  ridingStyle: RidingStyle;
  skillLevel: SkillLevel;
  flex: string;
  priceFrom: string;
  imageUrl: string;
  affiliateUrl: string;
  isActive: boolean;
  boardLine: "men" | "women" | "unisex";
  shapeType: BoardShape | "";
  dataStatus: ProductDataStatus;
  sourceName: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  scenariosText: string;
  notIdealForText: string;
  sizes: ProductSizeDraft[];
}

const boardLineLabels: Record<Product["boardLine"], string> = {
  men: "Мужская",
  women: "Женская",
  unisex: "Унисекс",
};

const widthOptions: WidthType[] = ["regular", "mid-wide", "wide"];

let nextDraftSizeId = 0;

function createDraftSizeId() {
  nextDraftSizeId += 1;
  return `size-${nextDraftSizeId}`;
}

function createEmptySize(): ProductSizeDraft {
  return {
    draftId: createDraftSizeId(),
    sizeCm: "",
    sizeLabel: "",
    waistWidthMm: "",
    recommendedWeightMin: "",
    recommendedWeightMax: "",
    widthType: "regular",
  };
}

function createEmptyDraft(): ProductDraft {
  return {
    id: "",
    slug: "",
    brand: "",
    modelName: "",
    descriptionShort: "",
    descriptionFull: "",
    ridingStyle: "all-mountain",
    skillLevel: "intermediate",
    flex: "5",
    priceFrom: "0",
    imageUrl: "",
    affiliateUrl: "",
    isActive: true,
    boardLine: "unisex",
    shapeType: "",
    dataStatus: "draft",
    sourceName: "",
    sourceUrl: "",
    sourceCheckedAt: "",
    scenariosText: "",
    notIdealForText: "",
    sizes: [createEmptySize()],
  };
}

function productToDraft(product: Product): ProductDraft {
  return {
    id: product.id,
    slug: product.slug,
    brand: product.brand,
    modelName: product.modelName,
    descriptionShort: product.descriptionShort,
    descriptionFull: product.descriptionFull,
    ridingStyle: product.ridingStyle,
    skillLevel: product.skillLevel,
    flex: String(product.flex),
    priceFrom: String(product.priceFrom),
    imageUrl: product.imageUrl,
    affiliateUrl: product.affiliateUrl,
    isActive: product.isActive,
    boardLine: product.boardLine,
    shapeType: product.shapeType ?? "",
    dataStatus: product.dataStatus,
    sourceName: product.sourceName ?? "",
    sourceUrl: product.sourceUrl ?? "",
    sourceCheckedAt: product.sourceCheckedAt ?? "",
    scenariosText: product.scenarios.join("\n"),
    notIdealForText: product.notIdealFor.join("\n"),
    sizes: product.sizes.map((size) => ({
      draftId: createDraftSizeId(),
      sizeCm: String(size.sizeCm),
      sizeLabel: size.sizeLabel ?? "",
      waistWidthMm: String(size.waistWidthMm),
      recommendedWeightMin: String(size.recommendedWeightMin),
      recommendedWeightMax:
        size.recommendedWeightMax == null ? "" : String(size.recommendedWeightMax),
      widthType: size.widthType,
    })),
  };
}

function compareProducts(left: Product, right: Product) {
  if (left.isActive !== right.isActive) {
    return Number(right.isActive) - Number(left.isActive);
  }

  return `${left.brand} ${left.modelName}`.localeCompare(
    `${right.brand} ${right.modelName}`,
    "ru",
  );
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function draftToPayload(draft: ProductDraft) {
  return {
    slug: draft.slug.trim(),
    brand: draft.brand.trim(),
    modelName: draft.modelName.trim(),
    descriptionShort: draft.descriptionShort.trim(),
    descriptionFull: draft.descriptionFull.trim(),
    ridingStyle: draft.ridingStyle,
    skillLevel: draft.skillLevel,
    flex: Number(draft.flex),
    priceFrom: Number(draft.priceFrom),
    imageUrl: draft.imageUrl.trim(),
    affiliateUrl: draft.affiliateUrl.trim(),
    isActive: draft.isActive,
    boardLine: draft.boardLine,
    shapeType: draft.shapeType || null,
    dataStatus: draft.dataStatus,
    sourceName: draft.sourceName.trim(),
    sourceUrl: draft.sourceUrl.trim(),
    sourceCheckedAt: draft.sourceCheckedAt.trim(),
    scenarios: splitLines(draft.scenariosText),
    notIdealFor: splitLines(draft.notIdealForText),
    sizes: draft.sizes.map((size) => ({
      sizeCm: Number(size.sizeCm),
      sizeLabel: size.sizeLabel.trim(),
      waistWidthMm: Number(size.waistWidthMm),
      recommendedWeightMin: Number(size.recommendedWeightMin),
      recommendedWeightMax:
        size.recommendedWeightMax.trim().length > 0
          ? Number(size.recommendedWeightMax)
          : null,
      widthType: size.widthType,
    })),
  };
}

export function CatalogEditor({ initialProducts }: CatalogEditorProps) {
  const [products, setProducts] = useState(() =>
    [...initialProducts].sort(compareProducts),
  );
  const [selectedId, setSelectedId] = useState(initialProducts[0]?.id ?? "new");
  const [draft, setDraft] = useState<ProductDraft>(() =>
    initialProducts[0] ? productToDraft(initialProducts[0]) : createEmptyDraft(),
  );
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return products.filter((product) => {
      if (!normalizedQuery) {
        return true;
      }

      return `${product.brand} ${product.modelName} ${product.slug}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [deferredQuery, products]);

  const stats = useMemo(() => {
    return {
      total: products.length,
      active: products.filter((product) => product.isActive).length,
      inactive: products.filter((product) => !product.isActive).length,
      verified: products.filter((product) => product.dataStatus === "verified").length,
      ready: products.filter(isReadyForCatalog).length,
    };
  }, [products]);

  const draftIssues = useMemo(() => {
    return getProductCatalogIssues({
      id: draft.id || "draft",
      slug: draft.slug || "draft",
      brand: draft.brand || "Без бренда",
      modelName: draft.modelName || "Без названия",
      descriptionShort: draft.descriptionShort,
      descriptionFull: draft.descriptionFull,
      ridingStyle: draft.ridingStyle,
      skillLevel: draft.skillLevel,
      flex: Number(draft.flex || 0),
      priceFrom: Number(draft.priceFrom || 0),
      imageUrl: draft.imageUrl,
      affiliateUrl: draft.affiliateUrl,
      isActive: draft.isActive,
      boardLine: draft.boardLine,
      shapeType: draft.shapeType || null,
      dataStatus: draft.dataStatus,
      sourceName: draft.sourceName.trim() || null,
      sourceUrl: draft.sourceUrl.trim() || null,
      sourceCheckedAt: draft.sourceCheckedAt.trim() || null,
      scenarios: splitLines(draft.scenariosText),
      notIdealFor: splitLines(draft.notIdealForText),
      sizes: [],
    });
  }, [draft]);

  const isExistingProduct = Boolean(draft.id);

  function resetStatus() {
    setSaveMessage("");
    setErrorMessage("");
  }

  function selectProduct(product: Product) {
    resetStatus();
    setSelectedId(product.id);
    setDraft(productToDraft(product));
  }

  function createProduct() {
    resetStatus();
    setSelectedId("new");
    setDraft(createEmptyDraft());
  }

  function updateDraft<Key extends keyof ProductDraft>(key: Key, value: ProductDraft[Key]) {
    resetStatus();
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateSize(
    index: number,
    key: keyof ProductSizeDraft,
    value: ProductSizeDraft[keyof ProductSizeDraft],
  ) {
    resetStatus();
    setDraft((current) => ({
      ...current,
      sizes: current.sizes.map((size, sizeIndex) =>
        sizeIndex === index ? { ...size, [key]: value } : size,
      ),
    }));
  }

  function addSize() {
    resetStatus();
    setDraft((current) => ({
      ...current,
      sizes: [...current.sizes, createEmptySize()],
    }));
  }

  function removeSize(index: number) {
    resetStatus();
    setDraft((current) => ({
      ...current,
      sizes:
        current.sizes.length === 1
          ? [createEmptySize()]
          : current.sizes.filter((_, sizeIndex) => sizeIndex !== index),
    }));
  }

  async function handleSave() {
    try {
      resetStatus();
      setIsSaving(true);

      const response = await fetch("/api/internal/catalog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftToPayload(draft)),
      });
      const payload = (await response.json()) as SaveResponse;

      if (!response.ok || !payload.product) {
        throw new Error(payload.message || "Не удалось сохранить модель.");
      }

      setProducts((current) => {
        const existingIndex = current.findIndex(
          (product) =>
            product.id === payload.product?.id || product.slug === payload.product?.slug,
        );

        if (existingIndex === -1) {
          return [...current, payload.product!].sort(compareProducts);
        }

        const nextProducts = [...current];
        nextProducts[existingIndex] = payload.product!;
        return nextProducts.sort(compareProducts);
      });

      setSelectedId(payload.product.id);
      setDraft(productToDraft(payload.product));
      setSaveMessage(payload.message);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось сохранить модель.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
      <aside className="space-y-5">
        <section className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="eyebrow">Внутренний каталог</span>
              <h1 className="heading-display mt-4 text-4xl font-bold">
                Управление моделями
              </h1>
            </div>
            <Link
              href="/internal/import"
              className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
            >
              Импорт из таблиц
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Всего моделей" value={String(stats.total)} />
            <StatCard label="Активных" value={String(stats.active)} />
            <StatCard label="Скрытых" value={String(stats.inactive)} />
            <StatCard label="Проверены" value={String(stats.verified)} />
            <StatCard label="Готовы к публикации" value={String(stats.ready)} />
          </div>

          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-semibold">Быстрый поиск</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Бренд, модель или slug"
              className="w-full rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)]"
            />
          </label>

          <button
            type="button"
            onClick={createProduct}
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[var(--color-pine)] px-5 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
          >
            Добавить новую модель
          </button>
        </section>

        <section className="panel max-h-[65vh] overflow-auto p-3">
          <div className="space-y-2">
            {filteredProducts.map((product) => {
              const isSelected = selectedId === product.id;

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => selectProduct(product)}
                  className={`w-full rounded-[1.2rem] border px-4 py-4 text-left ${
                    isSelected
                      ? "border-transparent bg-[linear-gradient(145deg,rgba(32,89,119,1),rgba(74,136,170,0.86))] text-white shadow-[0_16px_30px_rgba(32,89,119,0.16)]"
                      : "border-[var(--color-border)] bg-white hover:border-[var(--color-sky)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className={`text-xs font-bold uppercase tracking-[0.16em] ${
                          isSelected ? "text-white/68" : "text-[var(--color-sky-deep)]"
                        }`}
                      >
                        {product.brand}
                      </p>
                      <p className="mt-2 text-base font-bold">{product.modelName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          product.isActive
                            ? isSelected
                              ? "bg-white/18 text-white"
                              : "bg-[rgba(24,112,78,0.1)] text-[var(--color-pine)]"
                            : isSelected
                              ? "bg-white/12 text-white/84"
                              : "bg-[var(--color-paper-soft)] text-[var(--color-muted)]"
                        }`}
                      >
                        {product.isActive ? "Активна" : "Скрыта"}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          product.dataStatus === "verified"
                            ? isSelected
                              ? "bg-white/18 text-white"
                              : "bg-[rgba(46,116,196,0.1)] text-[var(--color-sky-deep)]"
                            : isSelected
                              ? "bg-white/12 text-white/84"
                              : "bg-[var(--color-paper-soft)] text-[var(--color-muted)]"
                        }`}
                      >
                        {productDataStatusLabels[product.dataStatus]}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`mt-4 flex flex-wrap gap-3 text-sm ${
                      isSelected ? "text-white/80" : "text-[var(--color-muted)]"
                    }`}
                  >
                    <span>{skillLevelLabels[product.skillLevel]}</span>
                    <span>{boardLineLabels[product.boardLine]}</span>
                    <span>
                      {product.shapeType
                        ? boardShapeLabels[product.shapeType]
                        : "форма не указана"}
                    </span>
                    <span>Размеров: {product.sizes.length}</span>
                    <span>{formatMoney(product.priceFrom)}</span>
                    <span>
                      {isReadyForCatalog(product)
                        ? "готова к публикации"
                        : `проблем: ${getProductCatalogIssues(product).length}`}
                    </span>
                  </div>
                </button>
              );
            })}

            {filteredProducts.length === 0 ? (
              <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm leading-7 text-[var(--color-muted)]">
                По текущему запросу ничего не найдено.
              </div>
            ) : null}
          </div>
        </section>
      </aside>

      <section className="panel p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="eyebrow">
              {isExistingProduct ? "Редактирование модели" : "Новая модель"}
            </span>
            <h2 className="heading-display mt-4 text-4xl font-bold">
              {draft.brand || draft.modelName
                ? `${draft.brand} ${draft.modelName}`.trim()
                : "Карточка модели"}
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-[var(--color-muted)]">
              Здесь можно поправить описание, ссылки, активность, сценарии и
              размерную сетку. Для существующих моделей `slug` фиксирован, чтобы
              не создать случайный дубль.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-6 py-4 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Сохраняем..." : "Сохранить модель"}
          </button>
        </div>

        {saveMessage ? (
          <div className="mt-6 rounded-[1.4rem] border border-[rgba(24,112,78,0.14)] bg-[rgba(24,112,78,0.08)] px-5 py-4 text-sm leading-7 text-[var(--color-pine)]">
            {saveMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-6 rounded-[1.4rem] border border-[rgba(173,62,55,0.18)] bg-[rgba(173,62,55,0.08)] px-5 py-4 text-sm leading-7 text-[var(--color-danger)]">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-8 grid gap-6">
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              label="Бренд"
              value={draft.brand}
              onChange={(value) => updateDraft("brand", value)}
            />
            <TextField
              label="Название модели"
              value={draft.modelName}
              onChange={(value) => updateDraft("modelName", value)}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
            <TextField
              label="Slug"
              value={draft.slug}
              onChange={(value) => updateDraft("slug", value)}
              disabled={isExistingProduct}
              hint={
                isExistingProduct
                  ? "Для существующей модели slug не редактируется."
                  : "Например: capita-outerspace-living"
              }
            />
            <ToggleField
              label="Показывать в каталоге"
              checked={draft.isActive}
              onChange={(value) => updateDraft("isActive", value)}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            <SelectField
              label="Стиль катания"
              value={draft.ridingStyle}
              onChange={(value) => updateDraft("ridingStyle", value)}
              options={[
                { value: "all-mountain", label: ridingStyleLabels["all-mountain"] },
                { value: "park", label: ridingStyleLabels.park },
                { value: "freeride", label: ridingStyleLabels.freeride },
              ]}
            />
            <SelectField
              label="Уровень"
              value={draft.skillLevel}
              onChange={(value) => updateDraft("skillLevel", value)}
              options={[
                { value: "beginner", label: skillLevelLabels.beginner },
                { value: "intermediate", label: skillLevelLabels.intermediate },
                { value: "advanced", label: skillLevelLabels.advanced },
              ]}
            />
            <SelectField
              label="Линейка"
              value={draft.boardLine}
              onChange={(value) => updateDraft("boardLine", value)}
              options={[
                { value: "men", label: boardLineLabels.men },
                { value: "women", label: boardLineLabels.women },
                { value: "unisex", label: boardLineLabels.unisex },
              ]}
            />
            <SelectField
              label="Форма / направленность"
              value={draft.shapeType}
              onChange={(value) => updateDraft("shapeType", value)}
              options={[
                { value: "", label: "Пока не указано" },
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
            <NumberField
              label="Жёсткость"
              value={draft.flex}
              onChange={(value) => updateDraft("flex", value)}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <NumberField
              label="Цена от, ₽"
              value={draft.priceFrom}
              onChange={(value) => updateDraft("priceFrom", value)}
            />
            <TextField
              label="Ссылка на изображение"
              value={draft.imageUrl}
              onChange={(value) => updateDraft("imageUrl", value)}
            />
          </div>

          <TextField
            label="Ссылка в магазин"
            value={draft.affiliateUrl}
            onChange={(value) => updateDraft("affiliateUrl", value)}
          />

          <div className="grid gap-5 rounded-[1.4rem] border border-[var(--color-border)] bg-[var(--color-paper-soft)] p-5 md:grid-cols-[0.8fr_1fr_1fr_0.8fr]">
            <SelectField
              label="Статус данных"
              value={draft.dataStatus}
              onChange={(value) => updateDraft("dataStatus", value)}
              options={[
                { value: "draft", label: productDataStatusLabels.draft },
                { value: "verified", label: productDataStatusLabels.verified },
              ]}
            />
            <TextField
              label="Источник характеристик"
              value={draft.sourceName}
              onChange={(value) => updateDraft("sourceName", value)}
              hint="Например: официальный размерный гид бренда."
            />
            <TextField
              label="Ссылка на источник"
              value={draft.sourceUrl}
              onChange={(value) => updateDraft("sourceUrl", value)}
            />
            <TextField
              label="Дата проверки"
              value={draft.sourceCheckedAt}
              onChange={(value) => updateDraft("sourceCheckedAt", value)}
              hint="Формат: 2026-04-07"
            />
          </div>

          {draftIssues.length ? (
            <div className="rounded-[1.4rem] border border-[rgba(206,143,39,0.18)] bg-[rgba(206,143,39,0.08)] px-5 py-4">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-sky-deep)]">
                Что ещё нужно для готовой карточки
              </p>
              <div className="mt-3 grid gap-2 text-sm leading-7 text-[var(--color-muted)]">
                {draftIssues.map((issue) => (
                  <p key={issue}>{issue}</p>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[1.4rem] border border-[rgba(24,112,78,0.14)] bg-[rgba(24,112,78,0.08)] px-5 py-4 text-sm leading-7 text-[var(--color-pine)]">
              Карточка выглядит готовой к публикации: статус, источник и ссылка в
              магазин на месте.
            </div>
          )}

          <TextareaField
            label="Короткое описание"
            value={draft.descriptionShort}
            onChange={(value) => updateDraft("descriptionShort", value)}
            rows={3}
          />

          <TextareaField
            label="Полное описание"
            value={draft.descriptionFull}
            onChange={(value) => updateDraft("descriptionFull", value)}
            rows={5}
          />

          <div className="grid gap-5 md:grid-cols-2">
            <TextareaField
              label="Кому подходит"
              value={draft.scenariosText}
              onChange={(value) => updateDraft("scenariosText", value)}
              rows={5}
              hint="Один сценарий на строку."
            />
            <TextareaField
              label="Кому не подходит"
              value={draft.notIdealForText}
              onChange={(value) => updateDraft("notIdealForText", value)}
              rows={5}
              hint="Один пункт на строку."
            />
          </div>

          <div className="rounded-[1.6rem] border border-[var(--color-border)] bg-[var(--color-paper-soft)] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--color-sky-deep)]">
                  Размерная сетка
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  Укажи числовую длину, а при необходимости и обозначение вроде
                  `160W`, затем ширину талии и рабочий диапазон веса.
                </p>
              </div>

              <button
                type="button"
                onClick={addSize}
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
              >
                Добавить размер
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {draft.sizes.map((size, index) => (
                <div
                  key={size.draftId}
                  className="rounded-[1.3rem] border border-white/70 bg-white p-4"
                >
                  <div className="grid gap-4 xl:grid-cols-[0.95fr_0.95fr_1fr_1fr_1fr_1fr_auto]">
                    <NumberField
                      label="Длина, см"
                      value={size.sizeCm}
                      onChange={(value) => updateSize(index, "sizeCm", value)}
                    />
                    <TextField
                      label="Обозначение"
                      value={size.sizeLabel}
                      onChange={(value) => updateSize(index, "sizeLabel", value)}
                      hint="Например: 160W"
                    />
                    <NumberField
                      label="Талия, мм"
                      value={size.waistWidthMm}
                      onChange={(value) => updateSize(index, "waistWidthMm", value)}
                    />
                    <NumberField
                      label="Вес от, кг"
                      value={size.recommendedWeightMin}
                      onChange={(value) =>
                        updateSize(index, "recommendedWeightMin", value)
                      }
                    />
                    <NumberField
                      label="Вес до, кг"
                      value={size.recommendedWeightMax}
                      onChange={(value) =>
                        updateSize(index, "recommendedWeightMax", value)
                      }
                      hint="Можно оставить пустым, если бренд указывает только нижнюю границу."
                    />
                    <SelectField
                      label="Ширина"
                      value={size.widthType}
                      onChange={(value) => updateSize(index, "widthType", value)}
                      options={widthOptions.map((option) => ({
                        value: option,
                        label: widthTypeLabels[option],
                      }))}
                    />
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeSize(index)}
                        className="inline-flex w-full items-center justify-center rounded-full border border-[rgba(173,62,55,0.16)] bg-[rgba(173,62,55,0.06)] px-4 py-3 text-sm font-bold text-[var(--color-danger)]"
                      >
                        Убрать
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-4">
      <p className="text-sm text-[var(--color-muted)]">{label}</p>
      <p className="mt-2 heading-display text-3xl font-bold text-[var(--color-sky-deep)]">
        {value}
      </p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)] disabled:cursor-not-allowed disabled:bg-[var(--color-paper-soft)]"
      />
      {hint ? (
        <span className="mt-2 block text-sm text-[var(--color-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)]"
      />
      {hint ? (
        <span className="mt-2 block text-sm text-[var(--color-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  rows,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)]"
      />
      {hint ? (
        <span className="mt-2 block text-sm text-[var(--color-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex h-full flex-col justify-between rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-3">
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--color-muted)]">
          {checked ? "Модель участвует в выдаче" : "Модель скрыта из выдачи"}
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 accent-[var(--color-pine)]"
        />
      </span>
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)]"
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
