import Link from "next/link";
import { MountEvent } from "@/components/analytics/mount-event";
import publicStyles from "@/components/public/public-ui.module.css";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";

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

export default function Home() {
  return (
    <div className={`${publicStyles.theme} edgefit-home`}>
      <MountEvent eventName="home_viewed" />
      <div className="edgefit-home__atmosphere" aria-hidden="true" />

      <section
        className="edgefit-home__hero container-shell"
        aria-labelledby="home-title"
      >
        <div className="edgefit-home__hero-copy">
          <p className={`${publicStyles.kicker} edgefit-home__kicker`}>
            Подбор сноуборда
          </p>
          <h1 id="home-title" className="edgefit-home__hero-title">
            Подберём сноуборд под рост, вес, ботинок и стиль катания.
          </h1>
          <p className="edgefit-home__hero-lead">
            Учитываем вес, рост, размер ботинка, стойку, уровень и стиль
            катания. В результате ты получаешь подходящий диапазон ростовок,
            рекомендацию по ширине и конкретные модели для сравнения.
          </p>
          <p className="edgefit-home__outcomes">
            Ростовка <span aria-hidden="true">/</span> ширина{" "}
            <span aria-hidden="true">/</span> риск зацепа ботинком{" "}
            <span aria-hidden="true">/</span> подходящие модели
          </p>

          <div className="edgefit-home__hero-actions">
            <Link
              href="/quiz"
              className={`${publicStyles.primaryAction} edgefit-home__cta-primary`}
            >
              Подобрать доску
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/catalog"
              prefetch={false}
              className={`${publicStyles.secondaryAction} edgefit-home__cta-secondary`}
            >
              Смотреть каталог
            </Link>
          </div>
        </div>

        <article
          className={`${publicStyles.raisedTechnicalSurface} edgefit-home__result-preview`}
          aria-labelledby="result-preview-title"
        >
          <div className="edgefit-home__preview-grid" aria-hidden="true" />
          <header className="edgefit-home__preview-header">
            <div>
              <p className={`${publicStyles.microLabel} edgefit-home__micro-label`}>
                Пример подбора
              </p>
              <h2 id="result-preview-title">Пример результата</h2>
            </div>
            <span className="edgefit-home__coordinate" aria-hidden="true">
              EF / 01
            </span>
          </header>

          <div className="edgefit-home__length-metric">
            <p>Диапазон ростовок</p>
            <div className="edgefit-home__length-value">
              <strong>154–157</strong>
              <span>см</span>
            </div>
            <p className="edgefit-home__metric-note">
              Диапазон, внутри которого можно выбирать более манёвренный или
              более стабильный вариант.
            </p>
          </div>

          <div className="edgefit-home__secondary-metrics">
            <div className="edgefit-home__metric edgefit-home__metric--width">
              <p>Ширина</p>
              <strong>средняя (mid-wide)</strong>
            </div>
            <div className="edgefit-home__metric">
              <p>Талия</p>
              <strong>
                ≈257 <span>мм</span>
              </strong>
            </div>
            <div className="edgefit-home__metric edgefit-home__metric--risk">
              <p>Риск зацепа ботинком</p>
              <strong>
                <span className="edgefit-home__risk-dot" aria-hidden="true" />
                средний риск
              </strong>
            </div>
          </div>

          <p className="edgefit-home__preview-explanation">
            Вес задаёт основу ростовки, а ботинок и стойка помогают понять,
            какой запас ширины стоит искать у конкретной модели.
          </p>

          <ul className="edgefit-home__badges" aria-label="Параметры примера">
            <li>all-mountain</li>
            <li>mid-wide</li>
            <li>ботинок учтён</li>
          </ul>
        </article>
      </section>

      <section
        className="edgefit-home__section container-shell"
        aria-labelledby="fit-factors-title"
      >
        <div className="edgefit-home__section-intro">
          <p className={`${publicStyles.kicker} edgefit-home__kicker`}>
            Что учитываем при подборе
          </p>
          <h2 id="fit-factors-title">Учитываем не только рост</h2>
          <p>
            Длина — только часть выбора. Ширина, стиль катания и уровень не
            менее важны, если хочется купить доску без неприятных сюрпризов.
          </p>
        </div>

        <ol className="edgefit-home__factor-rail">
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
        className="edgefit-home__comparison-section"
        aria-labelledby="comparison-title"
      >
        <div className="container-shell">
          <div className="edgefit-home__comparison-intro">
            <p className={`${publicStyles.kicker} edgefit-home__kicker`}>
              Как выбрать точнее
            </p>
            <h2 id="comparison-title">Почему нельзя выбирать доску только по росту</h2>
            <p>
              Рост — только один из параметров. Вес влияет на подходящую длину,
              размер ботинка — на ширину, а стиль катания помогает выбрать
              между близкими вариантами.
            </p>
          </div>

          <dl className="edgefit-home__comparison">
            <div className="edgefit-home__comparison-head" aria-hidden="true">
              <span />
              <span>Подбор только по росту</span>
              <span>EdgeFit</span>
            </div>
            {comparisonRows.map((row) => (
              <div className="edgefit-home__comparison-row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  <span>Подбор только по росту</span>
                  {row.simple}
                </dd>
                <dd>
                  <span>EdgeFit</span>
                  {row.edgeFit}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        className="edgefit-home__section edgefit-home__process-section container-shell"
        aria-labelledby="process-title"
      >
        <div className="edgefit-home__section-intro edgefit-home__section-intro--wide">
          <p className={`${publicStyles.kicker} edgefit-home__kicker`}>
            Как это работает
          </p>
          <h2 id="process-title">От параметров — к понятному выбору</h2>
        </div>

        <ol className="edgefit-home__process-rail">
          {processSteps.map((step) => (
            <ProcessStep key={step.number} {...step} />
          ))}
        </ol>
      </section>

      <section
        className="edgefit-home__trust container-shell"
        aria-labelledby="trust-title"
      >
        <div>
          <p className={`${publicStyles.kicker} edgefit-home__kicker`}>
            Как формируется рекомендация
          </p>
          <h2 id="trust-title">Показываем не только результат, но и причины</h2>
        </div>

        <div className="edgefit-home__trust-content">
          <p>
            В результате видно не только подходящий диапазон и модели, но и
            какие параметры повлияли на рекомендацию.
          </p>
          <ul>
            <li>Одинаковые вводные дают предсказуемый результат.</li>
            <li>Риск зацепа ботинком обозначается словами, а не только цветом.</li>
            <li>Перед покупкой всё равно стоит проверить геометрию нужного размера.</li>
          </ul>
          <p className="edgefit-home__trust-note">
            Рекомендация — рабочая отправная точка, а не абсолютная гарантия для
            любой модели.
          </p>
        </div>
      </section>

      <section
        className="edgefit-home__section edgefit-home__guides container-shell"
        aria-labelledby="guides-title"
      >
        <div className="edgefit-home__section-intro">
          <p className={`${publicStyles.kicker} edgefit-home__kicker`}>
            Разобраться глубже
          </p>
          <h2 id="guides-title">Гайды по выбору сноуборда</h2>
          <p>
            Короткие разборы для тех, кто хочет отдельно проверить ростовку,
            ширину или риск зацепа ботинком.
          </p>
        </div>

        <nav className="edgefit-home__guide-index" aria-label="Гайды по выбору">
          {seoLandingPages.map((page, index) => (
            <Link key={page.slug} href={getSeoLandingPath(page.slug)}>
              <span className="edgefit-home__guide-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{page.shortTitle}</strong>
                <small>{page.description}</small>
              </span>
              <span className="edgefit-home__guide-arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="edgefit-home__exit" aria-labelledby="final-cta-title">
        <div className="container-shell">
          <div className="edgefit-home__final-cta">
            <div>
              <p className={`${publicStyles.kicker} edgefit-home__kicker`}>
                Следующий шаг
              </p>
              <h2 id="final-cta-title">
                Готов понять, какая доска подходит под твои параметры?
              </h2>
              <p>
                Получишь диапазон длины, ширину и понятное объяснение выбора.
              </p>
            </div>
            <Link
              href="/quiz"
              className={`${publicStyles.primaryAction} edgefit-home__cta-primary`}
            >
              Подобрать доску
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
      <span className="edgefit-home__step-number" aria-hidden="true">
        {number}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </li>
  );
}
