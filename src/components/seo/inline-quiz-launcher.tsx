"use client";

import { useEffect, useRef, useState } from "react";
import publicStyles from "@/components/public/public-ui.module.css";
import { QuizFlow } from "@/components/quiz/quiz-flow";
import quizStyles from "@/components/quiz/quiz-flow.module.css";
import styles from "./inline-quiz-launcher.module.css";

export function InlineQuizLauncher() {
  const [opened, setOpened] = useState(false);
  const quizRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }

    quizRegionRef.current?.querySelector<HTMLElement>("#quiz-step-title")?.focus();
  }, [opened]);

  return (
    <section
      className={`${publicStyles.theme} ${quizStyles.quizPage} ${styles.launcher}`}
      aria-labelledby="inline-calculator-title"
    >
      <div className={styles.intro}>
        <p className={publicStyles.kicker}>EdgeFit / калькулятор</p>
        <h2 id="inline-calculator-title">Подберите длину, ширину и модели</h2>
        <p>
          Ответьте на три коротких шага. EdgeFit учтёт параметры
          райдера, стиль катания и риск зацепа ботинком.
        </p>

        {!opened ? (
          <button
            type="button"
            className={`${publicStyles.primaryAction} ${styles.action}`}
            aria-expanded="false"
            aria-controls="inline-quiz-content"
            onClick={() => setOpened(true)}
          >
            Открыть калькулятор
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>

      <div id="inline-quiz-content" ref={quizRegionRef} className={styles.quizMount}>
        {opened ? <QuizFlow /> : null}
      </div>
    </section>
  );
}
