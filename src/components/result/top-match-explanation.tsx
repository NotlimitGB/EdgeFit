import publicStyles from "@/components/public/public-ui.module.css";
import { getBoardSizeLabel } from "@/lib/board-size";
import {
  boardShapeLabels,
  camberProfileLabels,
  ridingStyleLabels,
  skillLevelLabels,
  terrainPriorityLabels,
  widthTypeLabels,
} from "@/lib/content";
import { formatRecommendedWeightRange } from "@/lib/weight-range";
import type { QuizInput, RecommendationMatch } from "@/types/domain";
import styles from "./result-view.module.css";

interface TopMatchExplanationProps {
  input: QuizInput;
  match: RecommendationMatch;
}

export function TopMatchExplanation({
  input,
  match,
}: TopMatchExplanationProps) {
  const sizeLabel = getBoardSizeLabel(match.size);
  const reasons =
    match.reasons.length > 0 ? match.reasons.slice(0, 3) : [match.fitLabel];
  const modelFacts = [
    ridingStyleLabels[match.product.ridingStyle],
    match.product.shapeType
      ? boardShapeLabels[match.product.shapeType]
      : null,
    match.product.camberProfile
      ? camberProfileLabels[match.product.camberProfile]
      : null,
  ].filter((value): value is string => value != null);

  const facts = [
    {
      label: "Твоё катание",
      values: [
        skillLevelLabels[input.skillLevel],
        ridingStyleLabels[input.ridingStyle],
        terrainPriorityLabels[input.terrainPriority],
      ],
    },
    {
      label: "Физические параметры",
      values: [`${input.weightKg} кг`, `EU ${input.bootSizeEu}`],
    },
    {
      label: "Выбранная ростовка",
      values: [
        `${sizeLabel} · ${widthTypeLabels[match.size.widthType]}`,
        `Талия ${match.size.waistWidthMm} мм`,
        `Рабочий вес ${formatRecommendedWeightRange(match.size)}`,
      ],
    },
    {
      label: "Характер модели",
      values: modelFacts,
    },
  ];

  return (
    <section
      className={styles.topMatchExplanation}
      aria-labelledby="top-match-explanation-title"
    >
      <header className={styles.topMatchExplanationHeader}>
        <p className={publicStyles.kicker}>Совпадение с профилем</p>
        <h3 id="top-match-explanation-title">Почему именно эта модель</h3>
        <p>
          Сверили твой стиль катания с характеристиками модели и конкретной
          рекомендованной ростовкой.
        </p>
      </header>

      <dl className={styles.topMatchFacts}>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>
              {fact.values.map((value) => (
                <span key={value}>{value}</span>
              ))}
            </dd>
          </div>
        ))}
      </dl>

      <div className={styles.topMatchReasons}>
        <p className={publicStyles.microLabel}>Почему она оказалась первой</p>
        <ol>
          {reasons.map((reason, index) => (
            <li key={`${reason}-${index}`}>
              <span aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p>{reason}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
