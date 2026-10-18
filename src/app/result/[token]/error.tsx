"use client";

import Link from "next/link";
import styles from "@/components/public/public-ui.module.css";

export default function SavedResultError({ reset }: { reset: () => void }) {
  return (
    <section className={`${styles.theme} container-shell`} style={{ paddingBlock: "3rem" }}>
      <h1>Не удалось загрузить результат</h1>
      <p role="alert">Сервис временно недоступен. Попробуй загрузить страницу ещё раз.</p>
      <button type="button" className={styles.primaryAction} onClick={reset}>
        Попробовать снова
      </button>{" "}
      <Link className={styles.secondaryAction} href="/quiz">
        Вернуться к подбору
      </Link>
    </section>
  );
}
