import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const DEFAULT_SPECS_FILE_PATH = fileURLToPath(
  new URL("../../src/data/official-specs/products.csv", import.meta.url),
);

const ALLOWED_CAMBER_PROFILES = new Set([
  "camber",
  "rocker",
  "flat",
  "hybrid-camber",
  "hybrid-rocker",
]);

const ALLOWED_SHAPE_TYPES = new Set([
  "twin",
  "asym-twin",
  "directional-twin",
  "directional",
  "tapered-directional",
]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseOptionalFlex(value, slug) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
    throw new Error(
      `Official specs row for "${slug}" has invalid flex "${normalized}".`,
    );
  }

  return Math.round(parsed);
}

function parseOptionalEnum(value, allowedValues, columnName, slug) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!allowedValues.has(normalized)) {
    throw new Error(
      `Official specs row for "${slug}" has invalid ${columnName} "${normalized}".`,
    );
  }

  return normalized;
}

function parseRequiredUrl(value, slug) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`Official specs row for "${slug}" is missing source_url.`);
  }

  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error(
      `Official specs row for "${slug}" has invalid source_url "${normalized}".`,
    );
  }
}

function parseCheckedAt(value, slug) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new Error(
      `Official specs row for "${slug}" has invalid source_checked_at "${normalized}".`,
    );
  }

  return normalized;
}

export async function loadOfficialProductSpecs(options = {}) {
  const filePath = options.filePath ?? DEFAULT_SPECS_FILE_PATH;

  if (!existsSync(filePath)) {
    return new Map();
  }

  const csvText = await readFile(filePath, "utf8");
  const rows = parse(csvText, {
    bom: true,
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
  });

  const specsBySlug = new Map();

  for (const row of rows) {
    const slug = normalizeText(row.slug);
    if (!slug) {
      throw new Error("Official specs row is missing slug.");
    }

    const sourceName = normalizeText(row.source_name);
    if (!sourceName) {
      throw new Error(`Official specs row for "${slug}" is missing source_name.`);
    }

    const flex = parseOptionalFlex(row.flex, slug);
    const camberProfile = parseOptionalEnum(
      row.camber_profile,
      ALLOWED_CAMBER_PROFILES,
      "camber_profile",
      slug,
    );
    const shapeType = parseOptionalEnum(
      row.shape_type,
      ALLOWED_SHAPE_TYPES,
      "shape_type",
      slug,
    );

    if (flex === null && camberProfile === null && shapeType === null) {
      throw new Error(
        `Official specs row for "${slug}" must include at least one of flex, camber_profile, or shape_type.`,
      );
    }

    specsBySlug.set(slug, {
      slug,
      flex,
      camberProfile,
      shapeType,
      sourceName,
      sourceUrl: parseRequiredUrl(row.source_url, slug),
      sourceCheckedAt: parseCheckedAt(row.source_checked_at, slug),
    });
  }

  return specsBySlug;
}

export function applyOfficialProductSpecs(product, spec) {
  if (!spec) {
    return product;
  }

  const hasOfficialFlex = spec.flex != null;

  return {
    ...product,
    flex: hasOfficialFlex ? spec.flex : product.flex,
    shapeType: spec.shapeType ?? product.shapeType ?? null,
    camberProfile: spec.camberProfile ?? product.camberProfile ?? null,
    dataStatus: hasOfficialFlex ? "verified" : product.dataStatus,
    sourceName: hasOfficialFlex ? spec.sourceName : product.sourceName,
    sourceUrl: hasOfficialFlex ? spec.sourceUrl : product.sourceUrl,
    sourceCheckedAt: hasOfficialFlex
      ? spec.sourceCheckedAt ?? product.sourceCheckedAt ?? null
      : product.sourceCheckedAt ?? null,
  };
}
