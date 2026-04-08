import { NextResponse } from "next/server";
import {
  countCatalogSizes,
  parseCatalogCsvTexts,
} from "@/lib/catalog-import/parse-catalog-csv.mjs";
import { upsertCatalogProducts } from "@/lib/catalog-import/upsert-catalog.mjs";
import { получитьКлиентБазы } from "@/lib/database/client";
import { базаНастроена } from "@/lib/database/config";

export const runtime = "nodejs";

function readFileFromFormData(
  formData: FormData,
  fieldName: string,
  expectedFileName: string,
) {
  const file = formData.get(fieldName);

  if (!(file instanceof File)) {
    throw new Error(`Добавьте файл "${expectedFileName}" перед загрузкой.`);
  }

  if (file.size === 0) {
    throw new Error(`Файл "${expectedFileName}" пустой.`);
  }

  return file;
}

export async function POST(request: Request) {
  try {
    if (!базаНастроена()) {
      return NextResponse.json(
        {
          message:
            "База данных не настроена. Сначала добавьте DATABASE_URL в .env.local.",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const modelsFile = readFileFromFormData(formData, "modelsFile", "models.csv");
    const sizesFile = readFileFromFormData(formData, "sizesFile", "sizes.csv");

    const [modelsCsvText, sizesCsvText] = await Promise.all([
      modelsFile.text(),
      sizesFile.text(),
    ]);

    const products = parseCatalogCsvTexts(modelsCsvText, sizesCsvText);
    const summary = await upsertCatalogProducts(получитьКлиентБазы(), products);

    return NextResponse.json({
      message: "Каталог успешно загружен в базу.",
      importedModels: summary.importedModels,
      importedSizes: summary.importedSizes ?? countCatalogSizes(products),
      modelsFileName: modelsFile.name,
      sizesFileName: sizesFile.name,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось обработать файлы каталога.",
      },
      { status: 400 },
    );
  }
}
