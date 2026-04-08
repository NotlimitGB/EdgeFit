import { NextResponse } from "next/server";
import { saveCatalogProduct } from "@/lib/catalog-import/upsert-catalog.mjs";
import { получитьКлиентБазы } from "@/lib/database/client";
import { базаНастроена } from "@/lib/database/config";
import { getCatalogProductsForInternalEditor } from "@/lib/internal/catalog-admin";
import { catalogProductSchema } from "@/lib/internal/catalog-product-schema";

export const runtime = "nodejs";

export async function GET() {
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

    const products = await getCatalogProductsForInternalEditor();
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось получить каталог из базы.",
      },
      { status: 400 },
    );
  }
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

    const payload = catalogProductSchema.parse(await request.json());
    const savedProduct = await saveCatalogProduct(получитьКлиентБазы(), payload);

    return NextResponse.json({
      message: "Модель сохранена.",
      product: savedProduct,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить модель.",
      },
      { status: 400 },
    );
  }
}
