import type { Metadata } from "next";
import { ResultView } from "@/components/result/result-view";
import { isSavedResultsEnabled } from "@/lib/saved-results";

export const metadata: Metadata = {
  title: "Результат подбора",
  description:
    "Результат квиза EdgeFit: диапазон длины, рекомендация по ширине и список подходящих моделей.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function ResultPage() {
  return <ResultView savedResultsEnabled={isSavedResultsEnabled()} />;
}
