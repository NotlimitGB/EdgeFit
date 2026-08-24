"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { TrackedStoreLink } from "@/components/analytics/tracked-store-link";
import publicStyles from "@/components/public/public-ui.module.css";
import {
  ProductRecommendationCard,
  recommendationRoleLabels,
} from "@/components/result/product-recommendation-card";
import { trackEvent } from "@/lib/analytics/client";
import { getBoardSizeLabel } from "@/lib/board-size";
import {
  boardShapeLabels,
  bootDragRiskLabels,
  ridingStyleLabels,
  stanceLabels,
  terrainPriorityLabels,
  widthTypeLabels,
} from "@/lib/content";
import { buildRecommendationDecisionGuide } from "@/lib/recommendation/decision-guide";
import { buildRecommendationPriorityImpact } from "@/lib/recommendation/priority-impact";
import { buildRecommendationTrustSummary } from "@/lib/recommendation/trust-summary";
import { getOrCreateSessionId } from "@/lib/session-id";
import { buildOutboundClickAnalyticsPayload } from "@/lib/outbound-click-analytics";
import {
  buildStoreRedirectHrefForSize,
  getStoreDestinationProvenance,
  getStoreDestinationPresentation,
  resolveProductStoreUrl,
} from "@/lib/store-redirect";
import {
  getSavedResultPath,
  RECOMMENDATION_RESULT_STORAGE_KEY,
  SAVED_RESULT_TOKEN_STORAGE_KEY,
} from "@/lib/saved-result-contract";
import type {
  RecommendationMatch,
  RecommendationResult,
} from "@/types/domain";
import styles from "./result-view.module.css";

let cachedRawRecommendation: string | null | undefined;
let cachedRecommendation: RecommendationResult | null = null;
let cachedRawSavedResultToken: string | null | undefined;
let cachedSavedResultToken: string | null = null;

const riskDescriptions: Record<RecommendationResult["bootDragRisk"], string> = {
  low: "Запас по ширине выглядит спокойным.",
  medium: "Ширину конкретного размера стоит проверить внимательнее.",
  high: "Перед покупкой обязательно сверь талию выбранного размера.",
};

const riskClasses: Record<RecommendationResult["bootDragRisk"], string> = {
  low: styles.riskLow,
  medium: styles.riskMedium,
  high: styles.riskHigh,
};

type ResultStorePlacement =
  | "primary_recommendation"
  | "alternative_recommendation"
  | "decision_guide"
  | "recommendation_comparison"
  | "caution_recommendation";

interface BuildResultStoreClickActionArgs {
  match: RecommendationMatch;
  source: string;
  placement: ResultStorePlacement;
  recommendationRank: number | null;
  algorithmVersion: string;
  isSavedMode: boolean;
  resultPayload?: Readonly<Record<string, unknown>>;
}

export function buildResultStoreClickAction({
  match,
  source,
  placement,
  recommendationRank,
  algorithmVersion,
  isSavedMode,
  resultPayload,
}: BuildResultStoreClickActionArgs) {
  const sizeLabel = getBoardSizeLabel(match.size);
  const destinationUrl = resolveProductStoreUrl(match.product);
  const destination = getStoreDestinationProvenance(destinationUrl);
  const recommendationContext = isSavedMode
    ? {}
    : {
        recommendationRank,
        recommendationScore: match.score,
        resultVariant: "session",
        algorithmVersion,
      };

  return {
    href: buildStoreRedirectHrefForSize(match.product.slug, match.size, {
      from: source,
      placement,
      sourceSizeLabel: match.size.sizeLabel,
      ...recommendationContext,
    }),
    analyticsPayload: isSavedMode
      ? undefined
      : {
          ...(resultPayload ?? {}),
          ...buildOutboundClickAnalyticsPayload({
          boardSlug: match.product.slug,
          offerSlug: match.product.slug,
          destinationUrl: destination.destinationUrl,
          from: source,
          placement,
          sizeCm: match.size.sizeCm,
          sizeLabel,
          sourceSizeLabel: match.size.sizeLabel,
          widthType: match.size.widthType,
          productId: match.product.id,
          productSlug: match.product.slug,
          brand: match.product.brand,
          modelName: match.product.modelName,
          recommendationRank,
          recommendationScore: match.score,
          storeCode: destination.storeCode,
          sourceProductId: destination.sourceProductId,
          resultVariant: "session",
          algorithmVersion,
          }),
        },
  };
}

interface EmailLeadResponse {
  message: string;
}

function subscribe() {
  return () => undefined;
}

function getRecommendationSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawRecommendation = window.sessionStorage.getItem(
    RECOMMENDATION_RESULT_STORAGE_KEY,
  );

  if (rawRecommendation === cachedRawRecommendation) {
    return cachedRecommendation;
  }

  cachedRawRecommendation = rawRecommendation;

  if (!rawRecommendation) {
    cachedRecommendation = null;
    return cachedRecommendation;
  }

  try {
    cachedRecommendation = JSON.parse(rawRecommendation) as RecommendationResult;
  } catch {
    cachedRecommendation = null;
  }

  return cachedRecommendation;
}

function getSavedResultTokenSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawToken = window.sessionStorage.getItem(SAVED_RESULT_TOKEN_STORAGE_KEY);

  if (rawToken === cachedRawSavedResultToken) {
    return cachedSavedResultToken;
  }

  cachedRawSavedResultToken = rawToken;
  cachedSavedResultToken = rawToken && getSavedResultPath(rawToken) ? rawToken : null;
  return cachedSavedResultToken;
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

function getCompactExplanation(recommendation: RecommendationResult) {
  return [
    recommendation.explanation[0],
    recommendation.explanation[3],
    recommendation.explanation[4],
  ].filter(Boolean);
}

export interface ResultViewProps {
  initialRecommendation?: RecommendationResult | null;
  mode?: "session" | "saved";
  savedResultsEnabled?: boolean;
}

export function ResultView({
  initialRecommendation = null,
  mode = "session",
  savedResultsEnabled = false,
}: ResultViewProps = {}) {
  const sessionRecommendation = useSyncExternalStore(
    subscribe,
    getRecommendationSnapshot,
    () => null,
  );
  const savedResultToken = useSyncExternalStore(
    subscribe,
    getSavedResultTokenSnapshot,
    () => null,
  );
  const recommendation =
    mode === "saved" ? initialRecommendation : sessionRecommendation;
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!recommendation || mode !== "session") {
      return;
    }

    void trackEvent("result_viewed", buildResultPayload(recommendation));
  }, [mode, recommendation]);

  useEffect(() => {
    if (!recommendation || mode !== "session") {
      return;
    }

    const currentRecommendation = recommendation;

    function handlePageHide() {
      void trackEvent("result_exited", buildResultPayload(currentRecommendation), {
        useBeacon: true,
      });
    }

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [mode, recommendation]);

  if (!recommendation) {
    return (
      <div
        className={`${publicStyles.theme} ${styles.resultPage} ${styles.emptyResultPage}`}
      >
        <div className={styles.atmosphere} aria-hidden="true" />
        <div className={styles.resultShell}>
          <section
            className={`${publicStyles.raisedTechnicalSurface} ${styles.emptyResult}`}
            aria-labelledby="empty-result-title"
          >
            <p className={publicStyles.kicker}>Нет сохранённого результата</p>
            <h1 id="empty-result-title">
              Сначала пройди квиз — здесь появится персональный fit
            </h1>
            <p className={styles.emptyResultLead}>
              После квиза покажем рабочую ростовку, ширину, риск boot drag и
              модели, с которых разумно начать сравнение.
            </p>
            <div className={styles.inlineActions}>
              <Link href="/quiz" className={publicStyles.primaryAction}>
                Пройти квиз <span aria-hidden="true">→</span>
              </Link>
              <Link href="/catalog" className={publicStyles.secondaryAction}>
                Открыть каталог
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const activeRecommendation = recommendation;
  const trustSummary = buildRecommendationTrustSummary(recommendation);
  const decisionGuideItems = buildRecommendationDecisionGuide(recommendation);
  const priorityImpact = buildRecommendationPriorityImpact(recommendation);
  const compactExplanation = getCompactExplanation(recommendation);
  const topBoards = recommendation.recommendedBoards.slice(0, 3);
  const comparisonBoards = recommendation.recommendedBoards.slice(0, 3);
  const extraRecommendedBoards = recommendation.recommendedBoards.slice(3);
  const isSavedMode = mode === "saved";
  const savedResultPath =
    mode === "session" && savedResultsEnabled && savedResultToken
      ? getSavedResultPath(savedResultToken)
      : null;

  function getStoreSource(location: string) {
    return `${isSavedMode ? "saved-result" : "result"}-${location}`;
  }

  function getCommercialPresentation(affiliateUrl: string) {
    return getStoreDestinationPresentation(
      affiliateUrl,
      isSavedMode ? "saved" : "session",
    );
  }

  async function handleCopySavedResult() {
    if (!savedResultPath || typeof navigator === "undefined") {
      return;
    }

    try {
      const savedResultUrl = new URL(savedResultPath, window.location.origin);
      await navigator.clipboard.writeText(savedResultUrl.toString());
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
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
        "Готово. Сохранили почту, чтобы вы могли вернуться к этому результату позже.",
      );

      void trackEvent("email_submitted", {
        source: "result-page",
        ...buildResultPayload(activeRecommendation),
      });
    } catch (error) {
      setEmailError(
        error instanceof Error ? error.message : "Не удалось сохранить почту.",
      );
    } finally {
      setIsSubmittingEmail(false);
    }
  }

  function buildProductClickAction(
    match: RecommendationMatch,
    location: string,
    placement: ResultStorePlacement,
    recommendationRank: number | null,
  ) {
    const source = getStoreSource(location);

    return buildResultStoreClickAction({
      match,
      source,
      placement,
      recommendationRank,
      algorithmVersion: activeRecommendation.algorithmVersion,
      isSavedMode,
      resultPayload: buildResultPayload(activeRecommendation),
    });
  }

  function handleRecalculationStart() {
    if (isSavedMode) {
      return;
    }

    void trackEvent("recalculation_started", buildResultPayload(activeRecommendation));
  }

  return (
    <div className={`${publicStyles.theme} ${styles.resultPage}`}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.resultShell}>
        <section
          className={`${publicStyles.raisedTechnicalSurface} ${styles.summary}`}
          aria-labelledby="result-title"
        >
          <div className={styles.summaryGrid} aria-hidden="true" />
          {isSavedMode ? (
            <div className={styles.savedResultNotice} role="note">
              <p className={publicStyles.microLabel}>Сохранённый результат</p>
              <strong>Это снимок fit и рекомендаций на момент расчёта.</strong>
              <p>
                Наличие, цена и условия внешнего магазина могли измениться —
                проверьте их перед покупкой.
              </p>
            </div>
          ) : null}
          <div className={styles.summaryLayout}>
            <div className={styles.summaryMain}>
              <p className={publicStyles.kicker}>Персональный snowboard fit</p>
              <h1 id="result-title">Твой рабочий fit</h1>
              <p className={styles.summaryLead}>
                Сначала — что искать. Ниже объясняем, почему диапазон и модели
                подходят именно под твои параметры.
              </p>

              <div className={styles.lengthMetric}>
                <p className={publicStyles.microLabel}>Ростовка</p>
                <div className={styles.lengthValue}>
                  <strong>
                    {recommendation.lengthRange.min}–{recommendation.lengthRange.max}
                  </strong>
                  <span>см</span>
                </div>
                <p>
                  Короче внутри диапазона — манёвреннее. Длиннее — стабильнее.
                </p>
              </div>

              <div className={styles.summaryMetrics}>
                <div className={styles.summaryMetric}>
                  <p className={publicStyles.microLabel}>Ширина</p>
                  <strong>
                    {widthTypeLabels[recommendation.recommendedWidthType]}
                  </strong>
                  <p>Категория под размер ботинка и стойку.</p>
                </div>
                <div className={styles.summaryMetric}>
                  <p className={publicStyles.microLabel}>Ориентир талии</p>
                  <strong>{recommendation.targetWaistWidthMm} мм</strong>
                  <p>Сверяй это значение у конкретного размера доски.</p>
                </div>
                <div
                  className={`${styles.summaryMetric} ${styles.riskMetric} ${
                    riskClasses[recommendation.bootDragRisk]
                  }`}
                >
                  <p className={publicStyles.microLabel}>Boot drag</p>
                  <strong>
                    <span className={styles.riskDot} aria-hidden="true" />
                    {bootDragRiskLabels[recommendation.bootDragRisk]} риск
                  </strong>
                  <p>{riskDescriptions[recommendation.bootDragRisk]}</p>
                </div>
              </div>

              <div className={styles.inlineActions}>
                <a href="#recommended-models" className={publicStyles.primaryAction}>
                  Смотреть рекомендации <span aria-hidden="true">↓</span>
                </a>
                <Link
                  href="/quiz"
                  onClick={handleRecalculationStart}
                  className={publicStyles.secondaryAction}
                >
                  Пересчитать
                </Link>
              </div>

              <div className={styles.fitContext}>
                <div>
                  <p className={publicStyles.microLabel}>Подходящая форма</p>
                  <strong>
                    {boardShapeLabels[recommendation.shapeProfile.primary]}
                  </strong>
                  <p>{recommendation.shapeProfile.headline}</p>
                </div>
                <div>
                  <p className={publicStyles.microLabel}>Сценарий</p>
                  <strong>
                    {terrainPriorityLabels[recommendation.input.terrainPriority]}
                  </strong>
                  <p>{priorityImpact.headline}</p>
                </div>
              </div>
            </div>

            <aside className={styles.inputContext} aria-label="Ваши параметры">
              <div className={styles.inputContextHeader}>
                <p className={publicStyles.microLabel}>Контекст расчёта</p>
                <span aria-hidden="true">EF / INPUT</span>
              </div>
              <dl className={styles.inputRail}>
                <InputMetric
                  term="Рост"
                  description={`${recommendation.input.heightCm} см`}
                />
                <InputMetric
                  term="Вес"
                  description={`${recommendation.input.weightKg} кг`}
                />
                <InputMetric
                  term="Ботинок"
                  description={`EU ${recommendation.input.bootSizeEu}`}
                />
                <InputMetric
                  term="Стиль"
                  description={ridingStyleLabels[recommendation.input.ridingStyle]}
                />
                <InputMetric
                  term="Приоритет"
                  description={
                    terrainPriorityLabels[recommendation.input.terrainPriority]
                  }
                />
                <InputMetric
                  term="Стойка"
                  description={stanceLabels[recommendation.input.stanceType]}
                />
              </dl>
            </aside>
          </div>
        </section>

        {savedResultPath ? (
          <section
            className={`${publicStyles.raisedTechnicalSurface} ${styles.saveResultSection}`}
            aria-labelledby="save-result-title"
          >
            <div>
              <p className={publicStyles.kicker}>Сохранить результат</p>
              <h2 id="save-result-title">Вернитесь к этому расчёту по ссылке</h2>
              <p>
                Ссылка открывает именно этот fit и подборку, даже после закрытия
                браузера или на другом устройстве.
              </p>
            </div>
            <div className={styles.saveResultActions}>
              <button
                type="button"
                className={publicStyles.primaryAction}
                onClick={() => void handleCopySavedResult()}
              >
                Скопировать ссылку
              </button>
              <p className={styles.saveResultDisclosure}>
                Любой, у кого есть ссылка, сможет увидеть параметры и результат.
              </p>
              <p className={styles.copyStatus} aria-live="polite">
                {copyStatus === "copied"
                  ? "Ссылка скопирована."
                  : copyStatus === "error"
                    ? "Не удалось скопировать ссылку. Попробуйте ещё раз."
                    : ""}
              </p>
            </div>
          </section>
        ) : null}

        {compactExplanation.length > 0 ? (
          <section className={styles.reasonSection} aria-labelledby="reason-title">
            <SectionHeader
              kicker="Почему так"
              title="Почему получился такой fit"
              description="Три короткие причины из расчёта — без скрытых формул и лишней теории."
              id="reason-title"
            />
            <ol className={styles.reasonRail}>
              {compactExplanation.map((item, index) => (
                <li key={item}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <p>{item}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section
          id="recommended-models"
          className={styles.recommendationSection}
          aria-labelledby="recommendation-title"
        >
          <SectionHeader
            kicker="Персональная подборка"
            title="Модели, с которых стоит начать"
            description="Сначала смотри на роль, размер и причины совпадения. Цена и переход в магазин идут после fit-аргументов."
            id="recommendation-title"
          />

          {topBoards.length > 0 ? (
            <div className={styles.recommendationGrid}>
              {topBoards.map((match, index) => {
                const rank = index + 1;
                const storeAction = buildProductClickAction(
                  match,
                  "top",
                  rank === 1
                    ? "primary_recommendation"
                    : "alternative_recommendation",
                  rank,
                );

                return (
                  <ProductRecommendationCard
                    key={`${match.product.id}-${getBoardSizeLabel(match.size)}`}
                    match={match}
                    position={rank}
                    variant={index === 0 ? "featured" : "recommended"}
                    shopHref={storeAction.href}
                    shopAnalyticsPayload={storeAction.analyticsPayload}
                    commercialPresentation={getCommercialPresentation(
                      match.product.affiliateUrl,
                    )}
                  />
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyRecommendations}>
              <p className={publicStyles.microLabel}>Fit готов, каталог не совпал</p>
              <h3>
                Fit рассчитан, но в текущем каталоге подходящих вариантов не
                нашли
              </h3>
              <p className={styles.emptyRecommendationsCopy}>
                Не подменяем результат случайными моделями. Можно изменить
                вводные или посмотреть каталог самостоятельно.
              </p>
              <div className={styles.inlineActions}>
                <Link
                  href="/quiz"
                  onClick={handleRecalculationStart}
                  className={publicStyles.secondaryAction}
                >
                  Пересчитать подбор
                </Link>
                <Link href="/catalog" className={styles.textAction}>
                  Смотреть каталог <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          )}
        </section>

        {topBoards.length > 0 && decisionGuideItems.length > 0 ? (
          <section className={styles.decisionSection} aria-labelledby="decision-title">
            <SectionHeader
              kicker="Быстрое решение"
              title="Если выбирать по характеру"
              description="Сравни сильные варианты по тому, как именно хочется чувствовать доску."
              id="decision-title"
            />
            <div className={styles.decisionGuideGrid}>
              {decisionGuideItems.map((item, index) => {
                const recommendationIndex = activeRecommendation.recommendedBoards.findIndex(
                  (match) => match.product.slug === item.boardSlug,
                );
                const match = activeRecommendation.recommendedBoards[recommendationIndex];
                const storeAction = match
                  ? buildProductClickAction(
                      match,
                      "decision-guide",
                      "decision_guide",
                      recommendationIndex + 1,
                    )
                  : null;

                return (
                <article key={item.id} className={styles.decisionGuideItem}>
                  <span className={styles.decisionNumber} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className={publicStyles.microLabel}>{item.title}</p>
                    <p className={styles.decisionGuideSummary}>{item.summary}</p>
                    <h3>{item.boardTitle}</h3>
                    <p className={styles.decisionSize}>Размер {item.sizeLabel}</p>
                    <p className={styles.decisionHighlight}>{item.highlight}</p>
                    <div className={styles.compactActions}>
                      <Link
                        href={`/boards/${item.boardSlug}`}
                        className={publicStyles.secondaryAction}
                      >
                        О модели
                      </Link>
                      {storeAction ? (
                        <TrackedStoreLink
                          href={storeAction.href}
                          analyticsPayload={storeAction.analyticsPayload}
                          className={publicStyles.primaryAction}
                        >
                          {
                            getCommercialPresentation(item.affiliateUrl)
                              .actionLabel
                          }
                        </TrackedStoreLink>
                      ) : null}
                    </div>
                  </div>
                </article>
                );
              })}
            </div>

            {comparisonBoards.length > 0 ? (
              <div className={styles.comparison}>
                <div className={styles.comparisonHeader}>
                  <p className={publicStyles.microLabel}>Верхние варианты рядом</p>
                  <p>Роль, размер и fit — без повторения полных карточек.</p>
                </div>
                <div className={styles.comparisonRows}>
                  {comparisonBoards.map((match, index) => {
                    const storeAction = buildProductClickAction(
                      match,
                      "comparison",
                      "recommendation_comparison",
                      index + 1,
                    );

                    return (
                    <article
                      key={`${match.product.id}-${match.size.sizeCm}-comparison`}
                      className={styles.comparisonRow}
                    >
                      <span aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p>{recommendationRoleLabels[match.role]}</p>
                        <h3>
                          {match.product.brand} {match.product.modelName}
                        </h3>
                      </div>
                      <p>
                        <strong>{getBoardSizeLabel(match.size)}</strong>
                        {match.fitLabel}
                      </p>
                      <div className={styles.comparisonActions}>
                        <Link
                          href={`/boards/${match.product.slug}`}
                          className={styles.textAction}
                        >
                          О модели
                        </Link>
                        <TrackedStoreLink
                          href={storeAction.href}
                          analyticsPayload={storeAction.analyticsPayload}
                          className={styles.textActionStrong}
                        >
                          {getCommercialPresentation(match.product.affiliateUrl)
                            .actionLabel} ↗
                        </TrackedStoreLink>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {!isSavedMode ? (
          <section className={styles.emailSection} aria-labelledby="email-title">
            <div>
              <p className={publicStyles.kicker}>Сохранить полезный результат</p>
              <h2 id="email-title">
                Сохрани подбор, чтобы вернуться к нему позже
              </h2>
              <p>
                Отправим этот fit на указанную почту. Без обещаний «идеальной
                доски» — только результат, к которому удобно вернуться.
              </p>
            </div>

            <form
              className={styles.emailForm}
              onSubmit={handleEmailSubmit}
              aria-busy={isSubmittingEmail}
            >
              <div className={styles.emailField}>
                <label htmlFor="result-email">Почта</label>
                <input
                  id="result-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  aria-invalid={emailError ? "true" : "false"}
                  aria-describedby={
                    emailError
                      ? "result-email-hint result-email-error"
                      : "result-email-hint"
                  }
                />
                <p id="result-email-hint">
                  Используем адрес только для сохранения результата и материалов
                  по теме.
                </p>
              </div>

              <label className={styles.consentField} htmlFor="result-consent">
                <input
                  id="result-consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  Согласен получить результат подбора и полезные материалы по
                  этой теме на указанную почту.
                </span>
              </label>

              {emailError ? (
                <p
                  id="result-email-error"
                  className={styles.formError}
                  role="alert"
                >
                  {emailError}
                </p>
              ) : null}

              {emailSuccess ? (
                <p className={styles.formSuccess} role="status">
                  {emailSuccess}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmittingEmail}
                className={`${publicStyles.primaryAction} ${styles.emailSubmitAction}`}
              >
                {isSubmittingEmail ? "Сохраняем..." : "Отправить на почту"}
              </button>
            </form>
          </section>
        ) : null}

        <section className={styles.methodSection} aria-label="Методика подбора">
          <details className={styles.methodDisclosure}>
            <summary>
              <span>
                <span className={publicStyles.microLabel}>Подробности расчёта</span>
                <strong>Как мы получили этот результат</strong>
                <small>
                  Форма, сценарий, полное объяснение и статус данных каталога.
                </small>
              </span>
              <span className={styles.disclosureMark} aria-hidden="true">+</span>
            </summary>

            <div className={styles.methodContent}>
              <div className={styles.detailMetrics}>
                {priorityImpact.cards.map((card) => (
                  <DetailMetric
                    key={card.id}
                    label={card.label}
                    value={card.value}
                    description={card.description}
                  />
                ))}
              </div>

              <ol className={styles.fullExplanation}>
                {recommendation.explanation.map((item, index) => (
                  <li key={item}>
                    <span aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p>{item}</p>
                  </li>
                ))}
              </ol>

              {trustSummary.totalCount > 0 ? (
                <div className={styles.trustSummary}>
                  <div>
                    <p className={publicStyles.microLabel}>Что известно о данных</p>
                    <h3>{trustSummary.headline}</h3>
                    <p className={styles.trustSummaryDescription}>
                      {trustSummary.description}
                    </p>
                    <p>{trustSummary.reviewMessage}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>В подборке</dt>
                      <dd>{trustSummary.totalCount}</dd>
                    </div>
                    <div>
                      <dt>Сверены</dt>
                      <dd>{trustSummary.readyCount}</dd>
                    </div>
                    <div>
                      <dt>Перепроверить</dt>
                      <dd>{trustSummary.needsReviewCount}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </div>
          </details>
        </section>

        {extraRecommendedBoards.length > 0 ? (
          <section className={styles.quietSection} aria-labelledby="extra-title">
            <SectionHeader
              kicker="Ещё в рабочей зоне"
              title="Дополнительные подходящие модели"
              description="Они остаются в исходном порядке рекомендации, но визуально идут после главного решения."
              id="extra-title"
            />
            <div className={styles.recommendationGrid}>
              {extraRecommendedBoards.map((match, index) => {
                const rank = index + 4;
                const storeAction = buildProductClickAction(
                  match,
                  "extra",
                  "alternative_recommendation",
                  rank,
                );

                return (
                  <ProductRecommendationCard
                    key={`${match.product.id}-${getBoardSizeLabel(match.size)}`}
                    match={match}
                    position={rank}
                    variant="extra"
                    shopHref={storeAction.href}
                    shopAnalyticsPayload={storeAction.analyticsPayload}
                    commercialPresentation={getCommercialPresentation(
                      match.product.affiliateUrl,
                    )}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {recommendation.avoidBoards.length > 0 ? (
          <section className={styles.carefulSection} aria-labelledby="careful-title">
            <SectionHeader
              kicker="С осторожностью"
              title="Хорошие доски, но слабее под текущий fit"
              description="Модель может быть удачной сама по себе — здесь она просто хуже совпадает с твоими параметрами и сценарием."
              id="careful-title"
            />
            <div className={styles.recommendationGrid}>
              {recommendation.avoidBoards.map((match, index) => {
                const storeAction = buildProductClickAction(
                  match,
                  "avoid",
                  "caution_recommendation",
                  null,
                );

                return (
                  <ProductRecommendationCard
                    key={`${match.product.id}-${getBoardSizeLabel(match.size)}`}
                    match={match}
                    position={index + 1}
                    variant="careful"
                    shopHref={storeAction.href}
                    shopAnalyticsPayload={storeAction.analyticsPayload}
                    commercialPresentation={getCommercialPresentation(
                      match.product.affiliateUrl,
                    )}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        <section className={styles.finalActions} aria-labelledby="final-action-title">
          <div>
            <p className={publicStyles.kicker}>Следующий шаг</p>
            <h2 id="final-action-title">Хочешь изменить вводные или посмотреть шире?</h2>
            <p>
              Пересчитай fit или перейди к каталогу — персональные модели выше
              останутся главным ориентиром.
            </p>
          </div>
          <div className={styles.inlineActions}>
            <Link
              href="/quiz"
              onClick={handleRecalculationStart}
              className={publicStyles.secondaryAction}
            >
              Пересчитать подбор
            </Link>
            <Link href="/catalog" className={styles.textAction}>
              Смотреть весь каталог <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  kicker: string;
  title: string;
  description: string;
  id: string;
}

function SectionHeader({ kicker, title, description, id }: SectionHeaderProps) {
  return (
    <header className={styles.sectionHeader}>
      <p className={publicStyles.kicker}>{kicker}</p>
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

interface DetailMetricProps {
  label: string;
  value: string;
  description: string;
}

function DetailMetric({ label, value, description }: DetailMetricProps) {
  return (
    <article className={styles.detailMetric}>
      <p className={publicStyles.microLabel}>{label}</p>
      <h3>{value}</h3>
      <p>{description}</p>
    </article>
  );
}

interface InputMetricProps {
  term: string;
  description: string;
}

function InputMetric({ term, description }: InputMetricProps) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{description}</dd>
    </div>
  );
}
