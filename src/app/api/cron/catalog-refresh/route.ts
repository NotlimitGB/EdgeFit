import { NextResponse } from "next/server";
import {
  isCatalogRefreshPipelineError,
  runCatalogRefreshPipeline,
} from "../../../../../scripts/lib/catalog-refresh-pipeline.mjs";
import { базаНастроена } from "@/lib/database/config";

export const runtime = "nodejs";
export const maxDuration = 300;

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function GET(request: Request) {
  try {
    if (!базаНастроена()) {
      return NextResponse.json(
        {
          message: "DATABASE_URL is not configured.",
        },
        { status: 500 },
      );
    }

    const cronSecret = process.env.CRON_SECRET?.trim();

    if (!cronSecret) {
      return NextResponse.json(
        {
          message: "CRON_SECRET is not configured.",
        },
        { status: 500 },
      );
    }

    if (getBearerToken(request) !== cronSecret) {
      return NextResponse.json(
        {
          message: "Unauthorized.",
        },
        { status: 401 },
      );
    }

    const result = await runCatalogRefreshPipeline({
      logger: console,
    });

    return NextResponse.json({
      message: "Catalog refresh pipeline completed successfully.",
      state: result.state,
      refresh: result.refresh,
      audit: result.audit,
      familyReconciliation: result.familyReconciliation,
    });
  } catch (error) {
    if (isCatalogRefreshPipelineError(error)) {
      return NextResponse.json(
        {
          message: error.message,
          stage: error.stage,
          state: error.state,
          catalogMayHaveCommitted: error.catalogMayHaveCommitted,
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        message: "Catalog refresh pipeline failed.",
      },
      { status: 500 },
    );
  }
}
