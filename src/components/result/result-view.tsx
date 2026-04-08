"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import { BoardCard } from "@/components/boards/board-card";
import { trackEvent } from "@/lib/analytics/client";
import { getBoardSizeLabel } from "@/lib/board-size";
import {
  boardShapeLabels,
  bootDragRiskLabels,
  ridingStyleLabels,
  terrainPriorityLabels,
  widthTypeLabels,
} from "@/lib/content";
import { buildRecommendationDecisionGuide } from "@/lib/recommendation/decision-guide";
import { demoRecommendation } from "@/lib/recommendation/demo";
import { buildRecommendationPriorityImpact } from "@/lib/recommendation/priority-impact";
import { buildRecommendationTrustSummary } from "@/lib/recommendation/trust-summary";
import { getOrCreateSessionId } from "@/lib/session-id";
import { buildStoreRedirectHref, buildStoreRedirectHrefForSize } from "@/lib/store-redirect";
import type { RecommendationResult } from "@/types/domain";

const RESULT_STORAGE_KEY = "edgefit.latest-recommendation";
let cachedRawRecommendation: string | null | undefined;
let cachedRecommendation: RecommendationResult = demoRecommendation;

interface EmailLeadResponse {
  message: string;
}

function subscribe() {
  return () => undefined;
}

function getRecommendationSnapshot() {
  if (typeof window === "undefined") {
    return demoRecommendation;
  }

  const rawRecommendation = window.sessionStorage.getItem(RESULT_STORAGE_KEY);

  if (rawRecommendation === cachedRawRecommendation) {
    return cachedRecommendation;
  }

  cachedRawRecommendation = rawRecommendation;

  if (!rawRecommendation) {
    cachedRecommendation = demoRecommendation;
    return cachedRecommendation;
  }

  try {
    cachedRecommendation = JSON.parse(rawRecommendation) as RecommendationResult;
  } catch {
    cachedRecommendation = demoRecommendation;
  }

  return cachedRecommendation;
}

function buildResultPayload(recommendation: RecommendationResult) {
  return {
    result_width_type: recommendation.recommendedWidthType,
    result_boot_drag_risk: recommendation.bootDragRisk,
    result_shape_primary: recommendation.shapeProfile.primary,
    riding_style: recommendation.input.ridingStyle,
    terrain_priority: recommendation.input.terrainPriority,
    skill_level: recommendation.input.skillLevel,
    board_line_preference: recommendation.input.boardLinePreference,
  };
}

function buildMatchNote(match: RecommendationResult["recommendedBoards"][number]) {
  const mainReason = match.reasons[0];

  if (match.isCatalogReady) {
    return mainReason ?? match.confidenceLabel;
  }

  return mainReason
    ? `${mainReason} Размер перед покупкой лучше ещё раз сверить вручную.`
    : "Модель выглядит рабочей, но размер перед покупкой лучше ещё раз сверить вручную.";
}

function getCompactExplanation(recommendation: RecommendationResult) {
  return [
    recommendation.explanation[0],
    recommendation.explanation[3],
    recommendation.explanation[4],
  ].filter(Boolean);
}

export function ResultView() {
  const recommendation = useSyncExternalStore(
    subscribe,
    getRecommendationSnapshot,
    () => demoRecommendation,
  );
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);

  const trustSummary = buildRecommendationTrustSummary(recommendation);
  const decisionGuideItems = buildRecommendationDecisionGuide(recommendation);
  const priorityImpact = buildRecommendationPriorityImpact(recommendation);
  const compactExplanation = getCompactExplanation(recommendation);
  const topBoards = recommendation.recommendedBoards.slice(0, 3);
  const comparisonBoards = recommendation.recommendedBoards.slice(0, 3);
  const extraRecommendedBoards = recommendation.recommendedBoards.slice(3);

  useEffect(() => {
    void trackEvent("result_viewed", buildResultPayload(recommendation));
  }, [recommendation]);

  useEffect(() => {
    function handlePageHide() {
      void trackEvent("result_exited", buildResultPayload(recommendation), {
        useBeacon: true,
      });
    }

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [recommendation]);

  if (!recommendation) {
    return (
      <div className="container-shell py-16">
        <div className="panel p-8">
          <p className="text-sm text-[var(--color-muted)]">
            Загружаем результат...
          </p>
        </div>
      </div>
    );
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setEmailError("");
      setEmailSuccess("");
      setIsSubmittingEmail(true);

      const response = await fetch("/api/email-leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          consent,
          source: "result-page",
          sessionId: getOrCreateSessionId(),
        }),
      });
      const payload = (await response.json()) as EmailLeadResponse;

      if (!response.ok) {
        throw new Error(payload.message || "Не удалось сохранить почту.");
      }

      setEmailSuccess(
        "Почта сохранена. Теперь этот результат можно использовать для повторного контакта.",
      );

      void trackEvent("email_submitted", {
        source: "result-page",
        ...buildResultPayload(recommendation),
      });
    } catch (error) {
      setEmailError(
        error instanceof Error ? error.message : "Не удалось сохранить почту.",
      );
    } finally {
      setIsSubmittingEmail(false);
    }
  }

  function buildProductClickPayload(
    placement: "recommended" | "avoid",
    boardSlug: string,
    sizeCm?: number,
    sizeLabel?: string,
    widthType?: string,
  ) {
    return {
      placement,
      board_slug: boardSlug,
      size_cm: sizeCm,
      size_label: sizeLabel,
      width_type: widthType,
      ...buildResultPayload(recommendation),
    };
  }

  function handleRecalculationStart() {
    void trackEvent("recalculation_started", buildResultPayload(recommendation));
  }

  return (
    <div className="container-shell py-10 sm:py-16">
      <section className="panel grid gap-6 p-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_21rem] xl:gap-8">
        <div>
          <span className="eyebrow">Результат подбора</span>
          <h1 className="heading-display mt-4 text-4xl font-bold text-balance sm:text-5xl">
            Длина {recommendation.lengthRange.min}-{recommendation.lengthRange.max} см,{" "}
            {widthTypeLabels[recommendation.recommendedWidthType]}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-[var(--color-muted)] sm:text-lg">
            Коротко: под ваши параметры нужен рабочий диапазон длины, запас по
            ширине под ботинок и форма доски без лишнего перекоса в чужой
            сценарий.
          </p>

          <div className="mt-6 rounded-[1.4rem] border border-[var(--color-border)] bg-[var(--color-paper-soft)] p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  Форма под сценарий
                </p>
                <p className="mt-2 text-xl font-bold text-[var(--color-ink)]">
                  {boardShapeLabels[recommendation.shapeProfile.primary]}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  {recommendation.shapeProfile.headline}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  Выбранный приоритет
                </p>
                <p className="mt-2 text-xl font-bold text-[var(--color-ink)]">
                  {terrainPriorityLabels[recommendation.input.terrainPriority]}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  {priorityImpact.headline}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Длина"
              value={`${recommendation.lengthRange.min}-${recommendation.lengthRange.max} см`}
              description="Рабочий диапазон без лишней псевдоточности."
            />
            <MetricCard
              label="Ширина"
              value={widthTypeLabels[recommendation.recommendedWidthType]}
              description={`Ориентир по талии около ${recommendation.targetWaistWidthMm} мм.`}
            />
            <MetricCard
              label="Риск зацепа"
              value={bootDragRiskLabels[recommendation.bootDragRisk]}
              description="Оценка по ботинку, ширине и стойке."
            />
          </div>

          <div className="mt-6 grid gap-3">
            {compactExplanation.map((item) => (
              <div
                key={item}
                className="rounded-[1.2rem] border border-[var(--color-border)] bg-white/72 px-4 py-4 text-sm leading-7 text-[var(--color-muted)]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[1.6rem] border border-white/60 bg-[linear-gradient(155deg,rgba(18,52,63,1),rgba(32,89,119,0.92))] p-6 text-white shadow-[0_24px_50px_rgba(18,52,63,0.18)]">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/68">
              Ваши параметры
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 xl:grid-cols-2">
              <MetricRow
                term="Рост"
                description={`${recommendation.input.heightCm} см`}
              />
              <MetricRow
                term="Вес"
                description={`${recommendation.input.weightKg} кг`}
              />
              <MetricRow
                term="Ботинок"
                description={`EU ${recommendation.input.bootSizeEu}`}
              />
              <MetricRow
                term="Стиль"
                description={ridingStyleLabels[recommendation.input.ridingStyle]}
              />
              <MetricRow
                term="Приоритет"
                description={
                  terrainPriorityLabels[recommendation.input.terrainPriority]
                }
              />
            </dl>
          </div>

          <div className="panel p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
              Что делать дальше
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <Link
                href="/catalog"
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-5 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
              >
                Смотреть все модели
              </Link>
              <Link
                href="/quiz"
                onClick={handleRecalculationStart}
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)]"
              >
                Пересчитать подбор
              </Link>
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-12">
        <div className="mb-6">
          <span className="eyebrow">Подходящие модели</span>
          <h2 className="heading-display mt-4 text-3xl font-bold sm:text-4xl">
            Что сейчас выглядит сильнее всего
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted)]">
            Здесь только главные варианты. Мы не растягиваем выдачу лишними
            карточками сверху, чтобы решение было проще принять.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {topBoards.map((match) => (
            <BoardCard
              key={`${match.product.id}-${getBoardSizeLabel(match.size)}`}
              product={match.product}
              size={match.size}
              eyebrow={match.fitLabel}
              note={buildMatchNote(match)}
              compact
              shopHref={buildStoreRedirectHrefForSize(match.product.slug, match.size, {
                from: "result-top",
                placement: "recommended",
              })}
              shopAnalyticsPayload={buildProductClickPayload(
                "recommended",
                match.product.slug,
                match.size.sizeCm,
                getBoardSizeLabel(match.size),
                match.size.widthType,
              )}
            />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="panel p-6 sm:p-8">
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
            <div>
              <span className="eyebrow">Сохранить результат</span>
              <h2 className="heading-display mt-4 text-3xl font-bold sm:text-4xl">
                Оставьте почту, если хотите вернуться позже
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
                Эта форма теперь ниже, чтобы не мешать просмотру результата, но
                по-прежнему остаётся под рукой.
              </p>
            </div>

            <form className="grid gap-4" onSubmit={handleEmailSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Почта</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-3 outline-none focus:border-[var(--color-sky)]"
                />
              </label>

              <label className="flex items-start gap-3 rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-4">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[var(--color-pine)]"
                />
                <span className="text-sm leading-7 text-[var(--color-muted)]">
                  Согласен получить результат подбора и связанный с ним полезный
                  материал по этой почте.
                </span>
              </label>

              {emailError ? (
                <p className="rounded-[1.2rem] border border-[rgba(173,62,55,0.18)] bg-[rgba(173,62,55,0.08)] px-4 py-3 text-sm leading-7 text-[var(--color-danger)]">
                  {emailError}
                </p>
              ) : null}

              {emailSuccess ? (
                <p className="rounded-[1.2rem] border border-[rgba(24,112,78,0.14)] bg-[rgba(24,112,78,0.08)] px-4 py-3 text-sm leading-7 text-[var(--color-pine)]">
                  {emailSuccess}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmittingEmail}
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-5 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingEmail ? "Сохраняем..." : "Отправить на почту"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <details className="panel group rounded-[1.8rem] p-5 sm:p-8">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
                Детали расчёта
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                Здесь всё, что важно для тех, кто хочет глубже понять логику
                подбора.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-bold text-[var(--color-pine)]">
              логика подбора
            </span>
          </summary>

          <div className="mt-6 space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {priorityImpact.cards.map((card) => (
                <MetricCard
                  key={card.id}
                  label={card.label}
                  value={card.value}
                  description={card.description}
                />
              ))}
            </div>

            <div className="grid gap-3">
              {recommendation.explanation.map((item) => (
                <div
                  key={item}
                  className="rounded-[1.2rem] border border-[var(--color-border)] bg-white/72 px-4 py-4 text-sm leading-7 text-[var(--color-muted)]"
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="rounded-[1.4rem] border border-[var(--color-border)] bg-[var(--color-paper-soft)] p-5">
              <p className="text-lg font-bold text-[var(--color-ink)]">
                {trustSummary.headline}
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                {trustSummary.description}
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="В подборке"
                  value={String(trustSummary.totalCount)}
                  description="Столько моделей сейчас участвуют в выдаче."
                />
                <MetricCard
                  label="Проверены"
                  value={String(trustSummary.readyCount)}
                  description="Карточки со сверенными данными и живыми ссылками."
                />
                <MetricCard
                  label="Перепроверить"
                  value={String(trustSummary.needsReviewCount)}
                  description="Карточки, которые лучше ещё раз проверить вручную."
                />
              </div>
            </div>
          </div>
        </details>

        <details className="panel group rounded-[1.8rem] p-5 sm:p-8">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]">
                Как выбрать из верхних вариантов
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                Здесь собраны три понятных сценария выбора и короткое сравнение
                верхних моделей с прямыми ссылками.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-bold text-[var(--color-pine)]">
              сценарии выбора
            </span>
          </summary>

          <div className="mt-6 space-y-6">
            <div className="grid gap-5 lg:grid-cols-3">
              {decisionGuideItems.map((item) => (
                <article
                  key={item.id}
                  className="flex h-full flex-col rounded-[1.6rem] border border-[var(--color-border)] bg-white/72 p-5"
                >
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--color-sky-deep)]">
                    {item.title}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-muted)] sm:min-h-[7rem]">
                    {item.summary}
                  </p>
                  <p className="mt-4 text-lg font-bold text-[var(--color-ink)] sm:min-h-[3.5rem]">
                    {item.boardTitle}
                  </p>
                  <p className="mt-2 inline-flex w-fit rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--color-pine)]">
                    Размер {item.sizeLabel}
                  </p>
                  <p className="mt-4 text-sm leading-7 text-[var(--color-ink)] sm:min-h-[6rem]">
                    {item.highlight}
                  </p>
                  <div className="mt-auto flex items-center gap-3 pt-5">
                    <Link
                      href={`/boards/${item.boardSlug}`}
                      className="inline-flex flex-1 items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)] hover:text-[var(--color-sky-deep)]"
                    >
                      О модели
                    </Link>
                    <TrackedStoreLink
                      href={buildStoreRedirectHref(item.boardSlug, {
                        from: "result-decision-guide",
                        placement: item.id,
                        sizeLabel: item.sizeLabel,
                      })}
                      analyticsPayload={buildProductClickPayload(
                        "recommended",
                        item.boardSlug,
                        undefined,
                        item.sizeLabel,
                      )}
                      className="inline-flex flex-1 items-center justify-center rounded-full bg-[var(--color-pine)] px-4 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
                    >
                      В магазин
                    </TrackedStoreLink>
                  </div>
                </article>
              ))}
            </div>

            <div className="rounded-[1.6rem] border border-[var(--color-border)] bg-white/72 p-5">
              <div className="mb-4">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--color-sky-deep)]">
                  Быстрое сравнение верхних вариантов
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                  Если не хочется читать длинные карточки, смотри на роль
                  варианта, размер и сразу переходи к модели.
                </p>
              </div>

              <div className="grid gap-3">
                {comparisonBoards.map((match, index) => (
                  <article
                    key={`${match.product.id}-${match.size.sizeCm}-row`}
                    className="rounded-[1.3rem] border border-[var(--color-border)] bg-white px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-sky-deep)]">
                          Вариант {index + 1}
                        </p>
                        <h3 className="mt-2 text-xl font-bold text-[var(--color-ink)]">
                          {match.product.brand} {match.product.modelName}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                          {match.fitLabel}. Размер {getBoardSizeLabel(match.size)}.
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Link
                          href={`/boards/${match.product.slug}`}
                          className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--color-pine)] hover:border-[var(--color-sky)] hover:text-[var(--color-sky-deep)]"
                        >
                          О модели
                        </Link>
                        <TrackedStoreLink
                          href={buildStoreRedirectHrefForSize(match.product.slug, match.size, {
                            from: "result-comparison",
                            placement: "recommended",
                          })}
                          analyticsPayload={buildProductClickPayload(
                            "recommended",
                            match.product.slug,
                            match.size.sizeCm,
                            getBoardSizeLabel(match.size),
                            match.size.widthType,
                          )}
                          className="inline-flex items-center justify-center rounded-full bg-[var(--color-pine)] px-4 py-3 text-sm font-bold text-white hover:-translate-y-0.5 hover:bg-[var(--color-sky-deep)]"
                        >
                          В магазин
                        </TrackedStoreLink>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            {extraRecommendedBoards.length > 0 ? (
              <div>
                <h3 className="text-2xl font-bold text-[var(--color-ink)]">
                  Ещё подходящие модели
                </h3>
                <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {extraRecommendedBoards.map((match) => (
                    <BoardCard
                      key={`${match.product.id}-${getBoardSizeLabel(match.size)}`}
                      product={match.product}
                      size={match.size}
                      eyebrow={match.fitLabel}
                      note={buildMatchNote(match)}
                      compact
                      shopHref={buildStoreRedirectHrefForSize(match.product.slug, match.size, {
                        from: "result-extra",
                        placement: "recommended",
                      })}
                      shopAnalyticsPayload={buildProductClickPayload(
                        "recommended",
                        match.product.slug,
                        match.size.sizeCm,
                        getBoardSizeLabel(match.size),
                        match.size.widthType,
                      )}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {recommendation.avoidBoards.length > 0 ? (
              <div>
                <h3 className="text-2xl font-bold text-[var(--color-ink)]">
                  С осторожностью
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-muted)]">
                  Эти модели не обязательно плохие сами по себе, но под ваши
                  вводные сейчас попадают слабее.
                </p>
                <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {recommendation.avoidBoards.map((match) => (
                    <BoardCard
                      key={`${match.product.id}-${getBoardSizeLabel(match.size)}`}
                      product={match.product}
                      size={match.size}
                      eyebrow="ниже по совпадению"
                      note={buildMatchNote(match)}
                      compact
                      shopHref={buildStoreRedirectHrefForSize(match.product.slug, match.size, {
                        from: "result-avoid",
                        placement: "avoid",
                      })}
                      shopAnalyticsPayload={buildProductClickPayload(
                        "avoid",
                        match.product.slug,
                        match.size.sizeCm,
                        getBoardSizeLabel(match.size),
                        match.size.widthType,
                      )}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </details>
      </section>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  description: string;
}

function MetricCard({ label, value, description }: MetricCardProps) {
  return (
    <div className="h-full rounded-[1.4rem] border border-[var(--color-border)] bg-white/82 p-5">
      <p className="text-sm font-semibold text-[var(--color-muted)]">{label}</p>
      <p className="mt-3 heading-display text-2xl font-bold text-[var(--color-ink)]">
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
        {description}
      </p>
    </div>
  );
}

interface MetricRowProps {
  term: string;
  description: string;
}

function MetricRow({ term, description }: MetricRowProps) {
  return (
    <div>
      <dt className="text-white/56">{term}</dt>
      <dd className="mt-1 font-semibold text-white">{description}</dd>
    </div>
  );
}
