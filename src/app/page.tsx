import Link from "next/link";
import { MountEvent } from "@/components/analytics/mount-event";
import { getSeoLandingPath, seoLandingPages } from "@/lib/seo-pages";

const scenarios = [
  {
    title: "Для первого сноуборда",
    text: "Помогаем не завалиться в слишком жёсткую, слишком длинную или слишком узкую доску.",
  },
  {
    title: "Для большого размера ботинка",
    text: "Быстро отделяем реальные wide-варианты от моделей с пограничной шириной.",
  },
  {
    title: "Для park и all-mountain",
    text: "Смещаем длину в нужную сторону, а не просто выдаём одну усреднённую цифру.",
  },
];

const principles = [
  "Подбор длины по весу с мягкой корректировкой по росту и стилю.",
  "Рекомендация по ширине с учетом размера ботинка и стойки.",
  "Проверка риска boot drag понятным языком.",
  "Список конкретных моделей, а не сухой калькулятор без следующего шага.",
];

export default function Home() {
  return (
    <div className="container-shell py-10 sm:py-14">
      <MountEvent eventName="home_viewed" />
      <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-center">
        <div className="space-y-6">
          <span className="eyebrow">Русскоязычный MVP</span>
          <h1 className="heading-display max-w-4xl text-5xl font-bold text-balance sm:text-6xl lg:text-7xl">
            Подбор сноуборда по параметрам тела, стилю и размеру ботинка
          </h1>
          <p className="max-w-3xl text-pretty text-lg leading-8 text-[var(--color-muted)] sm:text-xl">
            EdgeFit помогает понять рабочую ростовку, нужна ли wide-версия и
            какие модели реально подходят под ваши вводные. Без форумного шума и
            случайных советов.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/quiz"
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-6 py-4 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
            >
              Подобрать доску
            </Link>
            <Link
              href="/catalog"
              className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-6 py-4 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
            >
              Посмотреть каталог
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard value="1-2 мин" label="на прохождение квиза" />
            <StatCard value="3+" label="рекомендованных моделей" />
            <StatCard value="0 магии" label="только объяснимая логика" />
          </div>
        </div>

        <div className="panel grid-fade relative overflow-hidden p-6 sm:p-8">
          <div className="absolute -right-10 top-8 h-28 w-28 rounded-full bg-[rgba(74,136,170,0.18)] blur-3xl" />
          <div className="absolute bottom-0 left-8 h-24 w-24 rounded-full bg-[rgba(18,52,63,0.16)] blur-3xl" />

          <div className="relative space-y-4">
            <div className="rounded-[1.4rem] bg-[linear-gradient(150deg,rgba(18,52,63,1),rgba(32,89,119,0.92))] p-5 text-white shadow-[0_24px_50px_rgba(18,52,63,0.2)]">
              <p className="text-sm font-semibold text-white/68">Результат MVP</p>
              <p className="mt-4 heading-display text-3xl font-bold">
                154-157 см, mid-wide
              </p>
              <p className="mt-3 max-w-md text-sm leading-7 text-white/76">
                Вес тянет к базовой all-mountain длине, а размер ботинка уже
                просит дополнительный запас по ширине.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {principles.map((item) => (
                <div
                  key={item}
                  className="rounded-[1.2rem] border border-white/65 bg-white/78 p-4 text-sm leading-7 text-[var(--color-muted)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-4">
        {[
          "Подбор длины",
          "Подбор ширины",
          "Проверка boot drag",
          "Рекомендации по моделям",
        ].map((item) => (
          <div key={item} className="panel p-5">
            <p className="text-lg font-bold">{item}</p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              На первом релизе сервис решает ровно одну дорогую проблему: помочь
              выбрать правильную доску без лишней перегрузки.
            </p>
          </div>
        ))}
      </section>

      <section className="mt-16 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <span className="eyebrow">Как это работает</span>
          <h2 className="heading-display mt-4 text-4xl font-bold text-balance">
            Путь пользователя в три шага
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["1", "Заполняете квиз", "Только рост, вес, ботинок, уровень и стиль катания."],
            ["2", "Получаете расчёт", "Показываем диапазон длины, ширину и риск зацепа."],
            ["3", "Переходите к моделям", "Находите конкретные доски и идёте в магазин уже осознанно."],
          ].map(([step, title, text]) => (
            <div key={step} className="panel p-5">
              <p className="heading-display text-4xl font-bold text-[var(--color-sky-deep)]">
                {step}
              </p>
              <h3 className="mt-4 text-xl font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <div className="mb-6">
          <span className="eyebrow">Популярные сценарии</span>
          <h2 className="heading-display mt-4 text-4xl font-bold text-balance">
            Для кого проект особенно полезен
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((scenario) => (
            <article key={scenario.title} className="panel p-6">
              <h3 className="text-2xl font-bold">{scenario.title}</h3>
              <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                {scenario.text}
              </p>
            </article>
          ))}
          <article className="panel p-6">
            <h3 className="text-2xl font-bold">Для тех, кто сомневается между моделями</h3>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              Если список уже сузился до нескольких досок, сервис показывает,
              какие размеры и ширины реально работают под ваши параметры.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-16 panel overflow-hidden p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <span className="eyebrow">SEO-каркас MVP</span>
            <h2 className="heading-display mt-4 text-4xl font-bold">
              Уже готовы страницы под первые поисковые запросы
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {seoLandingPages.map((page) => (
              <Link
                key={page.slug}
                href={getSeoLandingPath(page.slug)}
                className="rounded-[1.2rem] border border-[var(--color-border)] bg-white/82 px-4 py-4 hover:border-[var(--color-sky)]"
              >
                <p className="text-sm font-bold text-[var(--color-ink)]">{page.shortTitle}</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  {page.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="panel p-5">
      <p className="heading-display text-3xl font-bold text-[var(--color-sky-deep)]">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{label}</p>
    </div>
  );
}
