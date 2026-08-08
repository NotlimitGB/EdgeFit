import type { Metadata } from "next";
import publicStyles from "@/components/public/public-ui.module.css";
import { QuizFlow } from "@/components/quiz/quiz-flow";
import styles from "@/components/quiz/quiz-flow.module.css";

export const metadata: Metadata = {
  title: "Квиз подбора сноуборда",
  description:
    "Пошаговый квиз EdgeFit для подбора длины, ширины и подходящих моделей сноубордов.",
};

export default function QuizPage() {
  return (
    <div className={`${publicStyles.theme} ${styles.quizPage}`}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.quizShell}>
        <header className={styles.pageIntro}>
          <p className={publicStyles.kicker}>EdgeFit / персональный fit</p>
          <h1>Подбор сноуборда под твои параметры</h1>
          <p>
            Три коротких шага — и ты получишь рабочую ростовку, безопасную
            ширину и модели, которые стоит сравнить в первую очередь.
          </p>
        </header>
        <QuizFlow />
      </div>
    </div>
  );
}
