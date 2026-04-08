import type { Metadata } from "next";
import { ResultView } from "@/components/result/result-view";

export const metadata: Metadata = {
  title: "Результат подбора",
  description:
    "Результат квиза EdgeFit: диапазон длины, рекомендация по ширине и список подходящих моделей.",
};

export default function ResultPage() {
  return <ResultView />;
}
