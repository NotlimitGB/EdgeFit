import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const sslMode = process.env.DATABASE_SSL === "disable" ? false : "require";

if (!databaseUrl) {
  console.error("Не задана переменная DATABASE_URL в .env.local");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  ssl: sslMode,
  prepare: false,
  max: 1,
});

function normalizeGalleryImages(value) {
  const rawImages =
    typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : Array.isArray(value)
        ? value
        : [];

  return rawImages
    .map((image) => String(image ?? "").trim())
    .filter(Boolean);
}

try {
  const rows = await sql`
    select id::text as "id", slug, gallery_images as "galleryImages"
    from products
  `;

  let updatedCount = 0;

  for (const row of rows) {
    const normalizedImages = normalizeGalleryImages(row.galleryImages);
    const currentImages = Array.isArray(row.galleryImages)
      ? row.galleryImages
          .map((image) => String(image ?? "").trim())
          .filter(Boolean)
      : null;

    const alreadyNormalized =
      currentImages &&
      currentImages.length === normalizedImages.length &&
      currentImages.every((image, index) => image === normalizedImages[index]);

    if (alreadyNormalized) {
      continue;
    }

    await sql`
      update products
      set gallery_images = ${JSON.stringify(normalizedImages)}::jsonb
      where id = ${row.id}
    `;

    updatedCount += 1;
  }

  console.log(
    `Готово. Исправлено карточек: ${updatedCount}. Без изменений: ${rows.length - updatedCount}.`,
  );
} finally {
  await sql.end({ timeout: 1 });
}
