import type { Metadata } from "next";
import Link from "next/link";
import { CatalogEntryLink } from "@/components/catalog/catalog-entry-link";
import { MountEvent } from "@/components/analytics/mount-event";
import publicStyles from "@/components/public/public-ui.module.css";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";

const homepageTitle = "Подбор сноуборда онлайн по параметрам — SnowDex";
const homepageDescription =
  "Подбери сноуборд по росту, весу, размеру ботинка, уровню и стилю катания. SnowDex рассчитает ростовку и ширину, оценит риск зацепа ботинком и покажет подходящие модели.";

export const metadata: Metadata = {
  title: {
    absolute: homepageTitle,
  },
  description: homepageDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: homepageTitle,
    description: homepageDescription,
    url: "/",
  },
};

const fitFactors = [
  {
    title: "Вес",
    text: "Сильнее всего влияет на подходящий диапазон длины.",
  },
  {
    title: "Рост",
    text: "Помогает скорректировать диапазон с учётом комплекции райдера.",
  },
  {
    title: "Ботинок",
    text: "Определяет нужный запас по ширине талии.",
  },
  {
    title: "Уровень",
    text: "Помогает не выбрать слишком требовательную доску.",
  },
  {
    title: "Стиль",
    text: "Помогает подобрать доску под парк, универсальное катание или фрирайд.",
  },
  {
    title: "Приоритет",
    text: "Учитывает, где и как ты чаще всего катаешься.",
  },
  {
    title: "Стойка",
    text: "Помогает точнее оценить нужную ширину и риск зацепа ботинком.",
  },
];

const comparisonRows = [
  {
    label: "Основа",
    simple: "Только рост",
    edgeFit: "Вес + рост",
  },
  {
    label: "Ответ",
    simple: "Одна цифра",
    edgeFit: "Рабочий диапазон",
  },
  {
    label: "Ширина",
    simple: "Обычно неясна",
    edgeFit: "Ботинок + стойка",
  },
  {
    label: "Катание",
    simple: "Один совет для всех",
    edgeFit: "Уровень + стиль",
  },
  {
    label: "После расчёта",
    simple: "Без объяснения",
    edgeFit: "Причины + модели",
  },
];

const processSteps = [
  {
    number: "01",
    title: "Ответь на вопросы",
    text: "Рост, вес, ботинок, уровень и стиль катания.",
  },
  {
    number: "02",
    title: "Посмотри результат",
    text: "Диапазон ростовок, подходящая ширина и модели для сравнения.",
  },
  {
    number: "03",
    title: "Сравни модели",
    text: "Доски, которые разумно проверить в первую очередь.",
  },
];

const homepageFaq = [
  {
    question: "Как подобрать сноуборд?",
    answer:
      "Начни с веса: он задаёт базовый диапазон длины. Затем учти рост, размер ботинка, стойку, уровень и стиль катания, а перед покупкой проверь параметры конкретной модели и ростовки.",
  },
  {
    question: "Что важнее при подборе сноуборда — рост или вес?",
    answer:
      "Вес важнее для базовой длины, а рост помогает скорректировать диапазон с учётом комплекции. Выбирать доску только по одному из этих параметров недостаточно.",
  },
  {
    question: "Как определить подходящую ростовку?",
    answer:
      "Сначала определи диапазон по весу, затем скорректируй его по росту, уровню и стилю катания. Внутри диапазона более короткая ростовка обычно манёвреннее, а более длинная — стабильнее.",
  },
  {
    question: "Как понять, нужен ли сноуборд Wide?",
    answer:
      "Сопоставь размер ботинка, углы стойки и ширину талии конкретной ростовки. Если параметры пограничные, геометрию выбранной доски стоит проверить особенно внимательно.",
  },
  {
    question: "Можно ли подобрать сноуборд онлайн?",
    answer:
      "Да. SnowDex покажет рабочий диапазон длины, ориентир по ширине, оценку риска зацепа ботинком и модели для сравнения. Перед покупкой всё равно проверь геометрию выбранной ростовки.",
  },
];

function buildHomepageFaqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: homepageFaq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export default function Home() {
  return (
    <div className={`${publicStyles.theme} snowdex-home`}>
      <MountEvent eventName="home_viewed" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildHomepageFaqSchema()) }}
      />


      <section
        className="snowdex-home__hero container-shell"
        aria-labelledby="home-title"
      >
        <div className="snowdex-home__hero-copy">
          <p className={`${publicStyles.kicker} snowdex-home__kicker`}>
            Подбор сноуборда
          </p>
          <h1 id="home-title" className="snowdex-home__hero-title">
            Сноуборд под твой вес и стиль катания
          </h1>
          <p className="snowdex-home__hero-lead">
            Укажи рост, вес, размер ботинка, уровень и стиль катания. SnowDex
            покажет подходящий диапазон ростовок и ширину, оценит риск зацепа
            ботинком и предложит конкретные модели для сравнения.
          </p>
          <p className="snowdex-home__outcomes">
            Ростовка <span aria-hidden="true">/</span> ширина{" "}
            <span aria-hidden="true">/</span> риск зацепа ботинком{" "}
            <span aria-hidden="true">/</span> подходящие модели
          </p>

          <div className="snowdex-home__hero-actions">
            <Link
              href="/quiz"
              className={`${publicStyles.primaryAction} snowdex-home__cta-primary`}
            >
              Подобрать сноуборд
              <span aria-hidden="true">→</span>
            </Link>
            <CatalogEntryLink
              className={`${publicStyles.secondaryAction} snowdex-home__cta-secondary`}
            >
              Смотреть каталог
            </CatalogEntryLink>
          </div>
        </div>

        <article
          className={`${publicStyles.raisedTechnicalSurface} snowdex-home__result-preview`}
          aria-labelledby="result-preview-title"
        >

          <header className="snowdex-home__preview-header">
            <div>
              <p className={`${publicStyles.microLabel} snowdex-home__micro-label`}>
                Пример подбора
              </p>
              <h2 id="result-preview-title">Пример результата</h2>
            </div>
            <span className="snowdex-home__coordinate" aria-hidden="true">
              SD / 01
            </span>
          </header>

          <div className="snowdex-home__length-metric">
            <p>Диапазон ростовок</p>
            <div className="snowdex-home__length-value">
              <strong>154–157</strong>
              <span>см</span>
            </div>
            <p className="snowdex-home__metric-note">
              Диапазон, внутри которого можно выбирать более манёвренный или
              более стабильный вариант.
            </p>
          </div>

          <div className="snowdex-home__secondary-metrics">
            <div className="snowdex-home__metric snowdex-home__metric--width">
              <p>Ширина</p>
              <strong>средняя (mid-wide)</strong>
            </div>
            <div className="snowdex-home__metric">
              <p>Талия</p>
              <strong>
                ≈257 <span>мм</span>
              </strong>
            </div>
            <div className="snowdex-home__metric snowdex-home__metric--risk">
              <p>Риск зацепа ботинком</p>
              <strong>
                <span className="snowdex-home__risk-dot" aria-hidden="true" />
                средний риск
              </strong>
            </div>
          </div>

          <p className="snowdex-home__preview-explanation">
            Вес задаёт основу ростовки, а ботинок и стойка помогают понять,
            какой запас ширины стоит искать у конкретной модели.
          </p>

          <ul className="snowdex-home__badges" aria-label="Параметры примера">
            <li>all-mountain</li>
            <li>mid-wide</li>
            <li>ботинок учтён</li>
          </ul>
        </article>
      </section>

      <section
        className="snowdex-home__section container-shell"
        aria-labelledby="fit-factors-title"
      >
        <div className="snowdex-home__section-intro">
          <p className={`${publicStyles.kicker} snowdex-home__kicker`}>
            Что учитываем при подборе
          </p>
          <h2 id="fit-factors-title">Как подобрать сноуборд по параметрам</h2>
          <p>
            Длина — только часть выбора. Ширина, стиль катания и уровень не
            менее важны, если хочется купить доску без неприятных сюрпризов.
          </p>
        </div>

        <ol className="snowdex-home__factor-rail">
          {fitFactors.map((factor, index) => (
            <FitFactor
              key={factor.title}
              index={String(index + 1).padStart(2, "0")}
              title={factor.title}
              text={factor.text}
            />
          ))}
        </ol>
      </section>

      <section
        className="snowdex-home__comparison-section"
        aria-labelledby="comparison-title"
      >
        <div className="container-shell">
          <div className="snowdex-home__comparison-intro">
            <p className={`${publicStyles.kicker} snowdex-home__kicker`}>
              Как выбрать точнее
            </p>
            <h2 id="comparison-title">Почему нельзя выбирать доску только по росту</h2>
            <p>
              Рост — только один из параметров. Вес влияет на подходящую длину,
              размер ботинка — на ширину, а стиль катания помогает выбрать
              между близкими вариантами.
            </p>
          </div>

          <dl className="snowdex-home__comparison">
            <div className="snowdex-home__comparison-head" aria-hidden="true">
              <span />
              <span>Подбор только по росту</span>
              <span>SnowDex</span>
            </div>
            {comparisonRows.map((row) => (
              <div className="snowdex-home__comparison-row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  <span>Подбор только по росту</span>
                  {row.simple}
                </dd>
                <dd>
                  <span>SnowDex</span>
                  {row.edgeFit}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        className="snowdex-home__section snowdex-home__process-section container-shell"
        aria-labelledby="process-title"
      >
        <div className="snowdex-home__section-intro snowdex-home__section-intro--wide">
          <p className={`${publicStyles.kicker} snowdex-home__kicker`}>
            Как это работает
          </p>
          <h2 id="process-title">Как проходит подбор сноуборда</h2>
        </div>

        <ol className="snowdex-home__process-rail">
          {processSteps.map((step) => (
            <ProcessStep key={step.number} {...step} />
          ))}
        </ol>
      </section>

      <section
        className="snowdex-home__trust container-shell"
        aria-labelledby="trust-title"
      >
        <div>
          <p className={`${publicStyles.kicker} snowdex-home__kicker`}>
            Как формируется рекомендация
          </p>
          <h2 id="trust-title">Почему тебе подходят эти параметры</h2>
        </div>

        <div className="snowdex-home__trust-content">
          <p>
            Рядом с диапазоном ростовок и рекомендациями моделей ты увидишь,
            как вес, ботинок и стиль катания повлияли на расчёт.
          </p>
          <ul>
            <li>Одинаковые вводные дают предсказуемый результат.</li>
            <li>Риск зацепа ботинком обозначается словами, а не только цветом.</li>
            <li>Перед покупкой всё равно стоит проверить геометрию нужного размера.</li>
          </ul>
          <p className="snowdex-home__trust-note">
            Используй рекомендацию, чтобы сузить выбор. Геометрию конкретной
            ростовки стоит проверить перед покупкой.
          </p>
        </div>
      </section>

      <section
        className="snowdex-home__section container-shell"
        aria-labelledby="faq-title"
      >
        <div className="snowdex-home__section-intro">
          <p className={`${publicStyles.kicker} snowdex-home__kicker`}>
            Частые вопросы
          </p>
          <h2 id="faq-title">Что важно знать перед подбором</h2>
          <p>
            Коротко о длине, ширине и параметрах, которые стоит проверить до
            покупки.
          </p>
        </div>

        <div className="snowdex-home__faq-list">
          {homepageFaq.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section
        className="snowdex-home__section snowdex-home__guides container-shell"
        aria-labelledby="guides-title"
      >
        <div className="snowdex-home__section-intro">
          <p className={`${publicStyles.kicker} snowdex-home__kicker`}>
            Разобраться глубже
          </p>
          <h2 id="guides-title">Статьи о выборе сноуборда</h2>
          <p>
            Короткие разборы для тех, кто хочет отдельно проверить ростовку,
            ширину или риск зацепа ботинком.
          </p>
        </div>

        <nav className="snowdex-home__guide-index" aria-label="Гайды по выбору">
          {seoLandingPages.map((page, index) => (
            <Link key={page.slug} href={getSeoLandingPath(page.slug)}>
              <span className="snowdex-home__guide-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{page.shortTitle}</strong>
                <small>{page.description}</small>
              </span>
              <span className="snowdex-home__guide-arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="snowdex-home__exit" aria-labelledby="final-cta-title">
        <div className="container-shell">
          <div className="snowdex-home__final-cta">
            <div>
              <p className={`${publicStyles.kicker} snowdex-home__kicker`}>
                Следующий шаг
              </p>
              <h2 id="final-cta-title">
                Узнай подходящую ростовку и ширину
              </h2>
              <p>
                Получишь диапазон длины, ширину и понятное объяснение выбора.
              </p>
            </div>
            <Link
              href="/quiz"
              className={`${publicStyles.primaryAction} snowdex-home__cta-primary`}
            >
              Подобрать сноуборд
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function FitFactor({
  index,
  title,
  text,
}: {
  index: string;
  title: string;
  text: string;
}) {
  return (
    <li>
      <span aria-hidden="true">{index}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </li>
  );
}

function ProcessStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <li>
      <span className="snowdex-home__step-number" aria-hidden="true">
        {number}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </li>
  );
}
