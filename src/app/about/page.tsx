import type { Metadata } from "next";
import Link from "next/link";
import publicStyles from "@/components/public/public-ui.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "О проекте",
  alternates: { canonical: "/about" },
};

const principles = [
  ["Подбор по параметрам райдера", "Вес задаёт основу длины. Ботинок и стойка помогают оценить ширину. Уровень и стиль уточняют характер доски."],
  ["Причины рядом с выводом", "Показываем рабочий диапазон и объясняем, что повлияло на выбор. Компромиссы и риск зацепа ботинком — часть результата."],
  ["Проверка конкретной ростовки", "У одной доски бывает несколько размеров с разной геометрией. Перед покупкой нужно проверить именно выбранный размер."],
];

export default function AboutPage() {
  return (
    <div className={`${publicStyles.theme} ${styles.page}`}>
      <div className="container-shell">
        <header className={styles.intro}>
          <p className={publicStyles.kicker}>О SnowDex</p>
          <h1>Помогаем разобраться в выборе сноуборда</h1>
          <p>SnowDex объясняет, как параметры райдера связаны с длиной и шириной доски, и помогает найти модели для дальнейшего сравнения.</p>
          <Link href="/quiz" className={publicStyles.primaryAction}>Подобрать сноуборд <span aria-hidden="true">↗</span></Link>
        </header>
        <section className={styles.section} aria-labelledby="today-title">
          <div><p className={publicStyles.kicker}>Возможности сервиса</p><h2 id="today-title">Что можно сделать в SnowDex</h2></div>
          <div className={styles.copy}>
            <p>Пройди подбор, чтобы узнать диапазон ростовок и ширину под твои параметры. В результате можно сравнить рекомендованные модели, а в каталоге изучить характеристики и проверить конкретную доску.</p>
            <p>Другие категории зимнего снаряжения — направление развития. Их подбора здесь пока нет.</p>
          </div>
        </section>
        <section className={styles.section} aria-labelledby="approach-title">
          <div><p className={publicStyles.kicker}>Наш подход</p><h2 id="approach-title">На чём основан подбор</h2></div>
          <ol className={styles.principles}>{principles.map(([title, text], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
        </section>
        <section className={styles.boundary} aria-labelledby="limits-title">
          <h2 id="limits-title">Что остаётся проверить самому</h2>
          <p>Рекомендация не заменяет проверку геометрии, примерку ботинка и личные предпочтения. Некоторые характеристики в каталоге могут уточняться. Цены и отметки наличия — ориентир по сохранённым данным, не подтверждение текущего предложения.</p>
          <p>SnowDex не продаёт снаряжение. Покупка и её условия — у магазина, к которому ты переходишь.</p>
          <Link href="/catalog" prefetch={false} className={publicStyles.secondaryAction}>Изучить каталог</Link>
        </section>
      </div>
    </div>
  );
}
