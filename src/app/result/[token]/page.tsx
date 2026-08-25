import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultView } from "@/components/result/result-view";
import { loadSavedResultByToken } from "@/lib/saved-results";

interface SavedResultPageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Сохранённый результат подбора",
  description: "Сохранённый снимок персонального результата EdgeFit.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default async function SavedResultPage({ params }: SavedResultPageProps) {
  const { token } = await params;
  const savedResult = await loadSavedResultByToken(token);

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
