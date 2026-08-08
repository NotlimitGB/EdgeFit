import Link from "next/link";
import { MountEvent } from "@/components/analytics/mount-event";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";

const fitFactors = [
  {
    title: "Вес",
    text: "Задаёт основу рабочего диапазона длины.",
  },
  {
    title: "Рост",
    text: "Уточняет диапазон, не перебивая вес.",
  },
  {
    title: "Ботинок",
    text: "Определяет нужный запас по ширине талии.",
  },
  {
    title: "Уровень",
    text: "Помогает не уйти в слишком требовательный профиль.",
  },
  {
    title: "Стиль",
    text: "Смещает fit к park, all-mountain или freeride.",
  },
  {
    title: "Приоритет",
    text: "Учитывает свич, дугу, трассу или мягкий снег.",
  },
  {
    title: "Стойка",
    text: "Уточняет запас талии и риск boot drag.",
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
    label: "Контекст",
    simple: "Один совет для всех",
    edgeFit: "Уровень + сценарий",
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
    title: "Получи fit",
    text: "Диапазон длины, ширина, талия, boot drag и профиль доски.",
  },
  {
    number: "03",
    title: "Сравни модели",
    text: "Доски, которые разумно проверить в первую очередь.",
  },
];

export default function Home() {
  return (
    <div className="edgefit-home">
      <MountEvent eventName="home_viewed" />
      <div className="edgefit-home__atmosphere" aria-hidden="true" />

      <section
        className="edgefit-home__hero container-shell"
        aria-labelledby="home-title"
      >
        <div className="edgefit-home__hero-copy">
          <p className="edgefit-home__kicker">EdgeFit / snowboard fit</p>
          <h1 id="home-title" className="edgefit-home__hero-title">
            Подберём сноуборд под рост, вес, ботинок и стиль катания.
          </h1>
          <p className="edgefit-home__hero-lead">
            Не просто «рост минус 20». Учитываем вес, размер ботинка, стойку,
            уровень и сценарий катания, чтобы дать понятный рабочий диапазон и
            модели для сравнения.
          </p>
          <p className="edgefit-home__outcomes">
            Ростовка <span aria-hidden="true">/</span> ширина талии{" "}
            <span aria-hidden="true">/</span> boot drag{" "}
            <span aria-hidden="true">/</span> подходящие модели
          </p>

          <div className="edgefit-home__hero-actions">
            <Link href="/quiz" className="edgefit-home__cta-primary">
              Подобрать доску
              <span aria-hidden="true">→</span>
            </Link>
            <Link href="/catalog" className="edgefit-home__cta-secondary">
              Смотреть каталог
            </Link>
          </div>
        </div>

        <article
          className="edgefit-home__result-preview"
          aria-labelledby="result-preview-title"
        >
          <div className="edgefit-home__preview-grid" aria-hidden="true" />
          <header className="edgefit-home__preview-header">
            <div>
              <p className="edgefit-home__micro-label">Демонстрационный fit</p>
              <h2 id="result-preview-title">Пример результата</h2>
            </div>
            <span className="edgefit-home__coordinate" aria-hidden="true">
              EF / 01
            </span>
          </header>

          <div className="edgefit-home__length-metric">
            <p>Рабочая ростовка</p>
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
              <strong>mid-wide</strong>
            </div>
            <div className="edgefit-home__metric">
              <p>Талия</p>
              <strong>
                ≈257 <span>мм</span>
              </strong>
            </div>
            <div className="edgefit-home__metric edgefit-home__metric--risk">
              <p>Boot drag</p>
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
          <p className="edgefit-home__kicker">Что влияет на fit</p>
          <h2 id="fit-factors-title">Смотрим на райдера целиком</h2>
          <p>
            Длина — только часть выбора. Ширина, сценарий и уровень не менее
            важны, если хочется купить доску без неприятных сюрпризов.
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
            <p className="edgefit-home__kicker">Не просто таблица ростовки</p>
            <h2 id="comparison-title">Почему «рост минус 20» недостаточно</h2>
            <p>
              Простое правило не видит вес, ботинок и то, как ты собираешься
              кататься. EdgeFit показывает диапазон и объясняет, откуда он
              взялся.
            </p>
          </div>

          <dl className="edgefit-home__comparison">
            <div className="edgefit-home__comparison-head" aria-hidden="true">
              <span />
              <span>Обычная таблица</span>
              <span>EdgeFit</span>
            </div>
            {comparisonRows.map((row) => (
              <div className="edgefit-home__comparison-row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  <span>Обычная таблица</span>
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
          <p className="edgefit-home__kicker">Как это работает</p>
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
          <p className="edgefit-home__kicker">Понятная методика</p>
          <h2 id="trust-title">Не магическая цифра, а объяснимый ориентир</h2>
        </div>

        <div className="edgefit-home__trust-content">
          <p>
            EdgeFit последовательно связывает физические параметры райдера с
            длиной, шириной и сценарием катания. В результате видно не только
            что смотреть, но и почему.
          </p>
          <ul>
            <li>Одинаковые вводные дают предсказуемый результат.</li>
            <li>Риск boot drag обозначается словами, а не только цветом.</li>
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
          <p className="edgefit-home__kicker">Разобраться глубже</p>
          <h2 id="guides-title">Технический индекс выбора</h2>
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
              <p className="edgefit-home__kicker">Следующий шаг</p>
              <h2 id="final-cta-title">
                Готов понять, какая доска подходит под твои параметры?
              </h2>
              <p>
                Получишь диапазон длины, ширину и понятное объяснение выбора.
              </p>
            </div>
            <Link href="/quiz" className="edgefit-home__cta-primary">
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
