import { z } from "zod";

const ridingStyleSchema = z.enum(["all-mountain", "park", "freeride"]);
const skillLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
const widthTypeSchema = z.enum(["regular", "mid-wide", "wide"]);
const boardLineSchema = z.enum(["men", "women", "unisex"]);
const shapeTypeSchema = z.enum([
  "twin",
  "asym-twin",
  "directional-twin",
  "directional",
  "tapered-directional",
]);
const productDataStatusSchema = z.enum(["draft", "verified"]);

const productSizeSchema = z.object({
  sizeCm: z.coerce
    .number()
    .min(120, "Размер доски должен быть не меньше 120 см.")
    .max(200, "Размер доски должен быть не больше 200 см."),
  sizeLabel: z
    .string()
    .trim()
    .max(24, "Обозначение размера слишком длинное.")
    .default(""),
  waistWidthMm: z.coerce
    .number()
    .min(220, "Ширина талии должна быть не меньше 220 мм.")
    .max(300, "Ширина талии должна быть не больше 300 мм."),
  recommendedWeightMin: z.coerce
    .number()
    .min(30, "Минимальный вес должен быть не меньше 30 кг.")
    .max(180, "Минимальный вес должен быть не больше 180 кг."),
  recommendedWeightMax: z
    .union([
      z.coerce
        .number()
        .min(30, "Максимальный вес должен быть не меньше 30 кг.")
        .max(180, "Максимальный вес должен быть не больше 180 кг."),
      z.null(),
    ])
    .default(null),
  widthType: widthTypeSchema,
});

export const catalogProductSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2, "Укажите slug.")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
        "Slug должен быть в латинице, через дефис и без пробелов.",
      ),
    brand: z.string().trim().min(1, "Укажите бренд."),
    modelName: z.string().trim().min(1, "Укажите название модели."),
    descriptionShort: z
      .string()
      .trim()
      .min(1, "Добавьте короткое описание."),
    descriptionFull: z
      .string()
      .trim()
      .min(1, "Добавьте полное описание."),
    ridingStyle: ridingStyleSchema,
    skillLevel: skillLevelSchema,
    flex: z.coerce
      .number()
      .min(1, "Жёсткость должна быть от 1 до 10.")
      .max(10, "Жёсткость должна быть от 1 до 10."),
    priceFrom: z.coerce
      .number()
      .min(0, "Цена не может быть отрицательной.")
      .max(500000, "Цена выглядит слишком большой."),
    imageUrl: z
      .string()
      .trim()
      .refine(
        (value) => value.startsWith("/") || z.string().url().safeParse(value).success,
        "Укажите корректную ссылку на изображение или локальный путь, который начинается с /.",
      ),
    affiliateUrl: z.string().trim().url("Укажите корректную ссылку на магазин."),
    isActive: z.boolean(),
    boardLine: boardLineSchema,
    shapeType: z.union([shapeTypeSchema, z.null()]).default(null),
    dataStatus: productDataStatusSchema.default("draft"),
    sourceName: z
      .string()
      .trim()
      .max(160, "Название источника слишком длинное.")
      .default(""),
    sourceUrl: z
      .string()
      .trim()
      .refine(
        (value) => value.length === 0 || z.string().url().safeParse(value).success,
        "Укажите корректную ссылку на источник.",
      )
      .default(""),
    sourceCheckedAt: z
      .string()
      .trim()
      .refine(
        (value) => value.length === 0 || /^\d{4}-\d{2}-\d{2}$/u.test(value),
        "Дата проверки должна быть в формате ГГГГ-ММ-ДД.",
      )
      .default(""),
    scenarios: z
      .array(z.string().trim().min(1))
      .max(12, "Слишком много сценариев.")
      .default([]),
    notIdealFor: z
      .array(z.string().trim().min(1))
      .max(12, "Слишком много ограничений.")
      .default([]),
    sizes: z
      .array(productSizeSchema)
      .min(1, "Добавьте хотя бы один размер.")
      .max(20, "Слишком много размеров для одной модели."),
  })
  .superRefine((value, context) => {
    if (value.dataStatus === "verified") {
      if (!value.sourceName.trim()) {
        context.addIssue({
          code: "custom",
          message: "Для проверенной карточки укажите название источника.",
          path: ["sourceName"],
        });
      }

      if (!value.sourceUrl.trim()) {
        context.addIssue({
          code: "custom",
          message: "Для проверенной карточки укажите ссылку на источник.",
          path: ["sourceUrl"],
        });
      }
    }

    value.sizes.forEach((size, index) => {
      if (
        size.recommendedWeightMax != null &&
        size.recommendedWeightMin > size.recommendedWeightMax
      ) {
        context.addIssue({
          code: "custom",
          message: "Минимальный вес не может быть больше максимального.",
          path: ["sizes", index, "recommendedWeightMin"],
        });
      }
    });
  });

export type CatalogProductInput = z.infer<typeof catalogProductSchema>;
