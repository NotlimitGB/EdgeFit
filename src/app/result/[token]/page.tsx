import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { ResultView } from "@/components/result/result-view";
import { withDbDiagnosticContext } from "@/lib/database/lifecycle-diagnostics";
import { runPublicDbWork } from "@/lib/database/public-work";
import { loadSavedResultByToken } from "@/lib/saved-results";

interface SavedResultPageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Сохранённый результат подбора",
  description: "Сохранённый снимок персонального результата SnowDex.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default async function SavedResultPage({ params }: SavedResultPageProps) {
  const { token } = await params;
  const savedResult = await withDbDiagnosticContext(
    { scope: "saved_result", stage: "snapshot_lookup", traceId: randomUUID() },
    () => runPublicDbWork("critical", 15_000, () => loadSavedResultByToken(token)),
  );

  if (!savedResult) {
    notFound();
  }

  return (
    <ResultView
      initialRecommendation={savedResult.recommendation}
      initialPurchasePreferences={savedResult.purchasePreferences}
      mode="saved"
    />
  );
}
