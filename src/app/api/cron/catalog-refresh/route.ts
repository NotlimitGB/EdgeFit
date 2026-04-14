import { NextResponse } from "next/server";
import { runCatalogAudit } from "../../../../../scripts/audit-catalog.mjs";
import { runStoreImport } from "../../../../../scripts/import-from-stores.mjs";
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

    const refresh = await runStoreImport({ logger: console });
    const audit = await runCatalogAudit({
      logger: console,
      writeReportToFile: false,
    });

    if (audit.failedChecks.length > 0) {
      return NextResponse.json(
        {
          message: "Catalog refresh finished, but audit found blocking issues.",
          refresh,
          audit: {
            failedChecks: audit.failedChecks,
            warningChecks: audit.warningChecks,
            summary: audit.report.summary,
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Catalog refresh completed successfully.",
      refresh,
      audit: {
        warningChecks: audit.warningChecks,
        summary: audit.report.summary,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Catalog refresh failed.",
      },
      { status: 500 },
    );
  }
}
