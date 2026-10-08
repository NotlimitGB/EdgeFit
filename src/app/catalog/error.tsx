"use client";

import styles from "@/components/public/public-ui.module.css";

export default function CatalogError({ reset }: { reset: () => void }) {
  return <section className={`${styles.theme} container-shell`} style={{ paddingBlock: "3rem" }}>
    <h1>Не удалось загрузить каталог</h1>
    <p role="alert">Сервис временно недоступен. Попробуй ещё раз немного позже.</p>
    <button type="button" className={styles.primaryAction} onClick={reset}>Попробовать снова</button>
  </section>;
}
