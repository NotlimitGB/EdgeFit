import Link from "next/link";
import { InlineQuizLauncher } from "@/components/seo/inline-quiz-launcher";
import type { SeoLandingPage } from "@/lib/seo-pages";
import {
  getRelatedSeoLandingPages,
  getSeoLandingPath,
} from "@/lib/seo-pages";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

const defaultDecisionCards = [
  {
    title: "Понятная логика",
    text: "Объясняем, почему размер меняется от веса, стиля катания и ботинка, а не прячем формулу.",
  },
  {
    title: "Проверка ширины",
    text: "Помогаем вовремя увидеть, когда проблема уже не в длине, а в слишком узкой доске.",
  },
  {
    title: "Переход к моделям",
    text: "Страница не заканчивается на теории: после чтения можно сразу перейти в квиз и каталог.",
  },
];

function buildArticleSchema(page: SeoLandingPage) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    inLanguage: "ru-RU",
    author: {
      "@type": "Organization",
      name: "EdgeFit",
    },
    publisher: {
      "@type": "Organization",
      name: "EdgeFit",
    },
    mainEntityOfPage: getAbsoluteSiteUrl(`/${page.slug}`),
  };
}

function buildFaqSchema(page: SeoLandingPage) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function SeoLandingPageView({ page }: { page: SeoLandingPage }) {
  const relatedPages = getRelatedSeoLandingPages(page);
  const decisionCards = page.decisionCards ?? defaultDecisionCards;

  return (
    <div className="container-shell py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildArticleSchema(page)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqSchema(page)) }}
      />

      <section className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr] xl:items-start">
        <div className="space-y-6">
          <span className="eyebrow">{page.eyebrow}</span>
          <h1 className="heading-display max-w-4xl text-5xl font-bold text-balance sm:text-6xl">
            {page.title}
          </h1>
          <p className="max-w-3xl text-pretty text-lg leading-8 text-[var(--color-muted)] sm:text-xl">
            {page.lead}
          </p>

          {page.interactiveExperience !== "quiz" ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/quiz"
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-6 py-4 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
              >
                Подобрать доску
              </Link>
              <Link
                href="/catalog"
                prefetch={false}
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-6 py-4 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
              >
                Посмотреть модели
              </Link>
            </div>
          ) : null}
        </div>

        <div className="panel grid-fade relative overflow-hidden p-6 sm:p-8">
          <div className="absolute -right-12 top-10 h-28 w-28 rounded-full bg-[rgba(74,136,170,0.18)] blur-3xl" />
          <div className="absolute bottom-6 left-10 h-24 w-24 rounded-full bg-[rgba(18,52,63,0.12)] blur-3xl" />
          <div className="relative">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
              Коротко по делу
            </p>
            <div className="mt-5 grid gap-4">
              {page.highlights.map((item) => (
                <div
                  key={item}
                  className="rounded-[1.2rem] border border-white/65 bg-white/82 p-4 text-sm leading-7 text-[var(--color-muted)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        {page.interactiveExperience === "quiz" ? (
          <div className="min-w-0 xl:col-span-2">
            <InlineQuizLauncher />
          </div>
        ) : null}
      </section>

      <section className="mt-16 grid gap-5 lg:grid-cols-3">
        {decisionCards.map((card) => (
          <article key={card.title} className="panel p-5">
            <h2 className="text-2xl font-bold">{card.title}</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{card.text}</p>
          </article>
        ))}
      </section>

      {page.comparison ? (
        <section className="panel mt-16 min-w-0 overflow-hidden p-6 sm:p-8">
          <div className="max-w-4xl">
            <span className="eyebrow">Сравнение</span>
            <h2 className="heading-display mt-4 text-3xl font-bold text-balance sm:text-4xl">
              {page.comparison.title}
            </h2>
            <p className="mt-4 text-base leading-8 text-[var(--color-muted)]">
              {page.comparison.description}
            </p>
          </div>

          <div className="mt-6 max-w-full overflow-x-auto">
            <table className="min-w-[48rem] w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  {page.comparison.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="border-b border-[var(--color-border)] bg-[var(--color-paper-soft)] px-4 py-4 font-bold text-[var(--color-pine)] first:rounded-tl-xl last:rounded-tr-xl"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.comparison.rows.map((row) => (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      className="border-b border-[var(--color-border)] bg-white/84 px-4 py-4 align-top font-bold text-[var(--color-ink)]"
                    >
                      {row.label}
                    </th>
                    {row.cells.map((cell) => (
                      <td
                        key={cell}
                        className="border-b border-[var(--color-border)] bg-white/72 px-4 py-4 align-top leading-7 text-[var(--color-muted)]"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-16 grid gap-6">
        {page.sections.map((section) => (
          <article key={section.title} className="panel p-6 sm:p-8">
            <h2 className="heading-display text-3xl font-bold text-balance sm:text-4xl">
              {section.title}
            </h2>

            <div className="mt-5 space-y-4">
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="max-w-4xl text-base leading-8 text-[var(--color-muted)]"
                >
                  {paragraph}
                </p>
              ))}
            </div>

            {section.bullets?.length ? (
              <ul className="mt-6 grid gap-3">
                {section.bullets.map((item) => (
                  <li
                    key={item}
                    className="rounded-[1.2rem] border border-[var(--color-border)] bg-white/76 px-4 py-4 text-sm leading-7 text-[var(--color-muted)]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      <section className="mt-16 panel overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <span className="eyebrow">Частые вопросы</span>
            <h2 className="heading-display mt-4 text-4xl font-bold text-balance">
              Что чаще всего спрашивают перед покупкой
            </h2>
          </div>

          <div className="grid gap-4">
            {page.faq.map((item) => (
              <article
                key={item.question}
                className="rounded-[1.2rem] border border-[var(--color-border)] bg-white/84 p-5"
              >
                <h3 className="text-xl font-bold">{item.question}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-16 grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="panel p-6 sm:p-8">
          <span className="eyebrow">Следующий шаг</span>
          <h2 className="heading-display mt-4 text-4xl font-bold text-balance">
            Проверьте свои параметры на живом подборе
          </h2>
          <p className="mt-4 text-base leading-8 text-[var(--color-muted)]">
            После чтения статьи логично перейти в квиз и проверить свой случай на
            конкретных вводных: рост, вес, ботинок, стиль и уровень катания.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/quiz"
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-6 py-4 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
            >
              Открыть квиз
            </Link>
              <Link
                href="/catalog"
                prefetch={false}
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-6 py-4 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
              >
                Открыть каталог
              </Link>
          </div>
        </div>

        <div className="panel p-6 sm:p-8">
          <span className="eyebrow">Полезные страницы</span>
          <h2 className="heading-display mt-4 text-4xl font-bold text-balance">
            Что ещё посмотреть по теме
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {relatedPages.map((item) => (
              <Link
                key={item.slug}
                href={getSeoLandingPath(item.slug)}
                className="rounded-[1.2rem] border border-[var(--color-border)] bg-white/82 p-4 hover:border-[var(--color-sky)]"
              >
                <p className="text-lg font-bold text-[var(--color-ink)]">{item.shortTitle}</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
