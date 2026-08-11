import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultView } from "@/components/result/result-view";
import { loadSavedRecommendationByToken } from "@/lib/saved-results";

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
  const recommendation = await loadSavedRecommendationByToken(token);

  if (!recommendation) {
    notFound();
  }

  return <ResultView initialRecommendation={recommendation} mode="saved" />;
}
