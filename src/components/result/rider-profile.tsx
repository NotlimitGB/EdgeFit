import {
  aggressivenessLabels,
  boardLineLabels,
  formatMoney,
  ridingStyleLabels,
  skillLevelLabels,
  stanceLabels,
  terrainPriorityLabels,
} from "@/lib/content";
import type { PurchasePreferences } from "@/lib/purchase-preferences";
import type { QuizInput } from "@/types/domain";
import publicStyles from "@/components/public/public-ui.module.css";
import styles from "./result-view.module.css";

export interface RiderProfileItem {
  key: keyof QuizInput | "budgetMaxRub";
  label: string;
  value: string;
}

export interface RiderProfileGroup {
  key: "physical" | "riding" | "preferences";
  label: string;
  items: RiderProfileItem[];
}

export function buildRiderProfile(
  input: QuizInput,
  purchasePreferences: PurchasePreferences,
): RiderProfileGroup[] {
  return [
    {
      key: "physical",
      label: "Параметры",
      items: [
        { key: "heightCm", label: "Рост", value: `${input.heightCm} см` },
        { key: "weightKg", label: "Вес", value: `${input.weightKg} кг` },
        { key: "bootSizeEu", label: "Ботинок", value: `EU ${input.bootSizeEu}` },
        {
          key: "stanceType",
          label: "Стойка",
          value: stanceLabels[input.stanceType],
        },
      ],
    },
    {
      key: "riding",
      label: "Катание",
      items: [
        {
          key: "skillLevel",
          label: "Уровень",
          value: skillLevelLabels[input.skillLevel],
        },
        {
          key: "ridingStyle",
          label: "Стиль",
          value: ridingStyleLabels[input.ridingStyle],
        },
        {
          key: "terrainPriority",
          label: "Приоритет",
          value: terrainPriorityLabels[input.terrainPriority],
        },
      ],
    },
    {
      key: "preferences",
      label: "Предпочтения",
      items: [
        {
          key: "aggressiveness",
          label: "Характер",
          value: aggressivenessLabels[input.aggressiveness],
        },
        {
          key: "boardLinePreference",
          label: "Линейка",
          value: boardLineLabels[input.boardLinePreference],
        },
        {
          key: "budgetMaxRub",
          label: "Бюджет",
          value:
            purchasePreferences.budgetMaxRub == null
              ? "не указан"
              : `до ${formatMoney(purchasePreferences.budgetMaxRub)}`,
        },
      ],
    },
  ];
}

interface RiderProfileProps {
  input: QuizInput;
  purchasePreferences: PurchasePreferences;
}

export function RiderProfile({ input, purchasePreferences }: RiderProfileProps) {
  const groups = buildRiderProfile(input, purchasePreferences);

  return (
    <section className={styles.riderProfile} aria-labelledby="rider-profile-title">
      <header className={styles.riderProfileHeader}>
        <p className={publicStyles.kicker}>Исходные данные</p>
        <h2 id="rider-profile-title">Твой профиль</h2>
        <p>
          Проверь, что мы правильно поняли твои параметры, катание и предпочтения.
        </p>
      </header>

      <div className={styles.riderProfileGroups}>
        {groups.map((group) => {
          const headingId = `rider-profile-${group.key}`;

          return (
            <section
              key={group.key}
              className={styles.riderProfileGroup}
              aria-labelledby={headingId}
            >
              <h3 id={headingId}>{group.label}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.key}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </section>
  );
}
