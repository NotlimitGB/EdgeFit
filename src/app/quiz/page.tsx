import type { Metadata } from "next";
import { QuizFlow } from "@/components/quiz/quiz-flow";

export const metadata: Metadata = {
  title: "Квиз подбора сноуборда",
  description:
    "Пошаговый квиз EdgeFit для подбора длины, ширины и подходящих моделей сноубордов.",
};

export default function QuizPage() {
  return (
    <div className="container-shell py-12 sm:py-16">
      <QuizFlow />
    </div>
  );
}
