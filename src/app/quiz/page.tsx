import type { Metadata } from "next";
import publicStyles from "@/components/public/public-ui.module.css";
import { QuizFlow } from "@/components/quiz/quiz-flow";
import styles from "@/components/quiz/quiz-flow.module.css";
import { resolveCanonicalBoardRouteBySlug } from "@/lib/canonical-catalog";
import { focusedBoardSlugSchema } from "@/lib/quiz/schema";

export const metadata: Metadata = {
  title: "Квиз подбора сноуборда",
  alternates: { canonical: "/quiz" },
  description:
    "Пошаговый квиз SnowDex для подбора длины, ширины и подходящих моделей сноубордов.",
};

interface QuizPageProps {
  searchParams: Promise<{ board?: string | string[] }>;
}

export default async function QuizPage({ searchParams }: QuizPageProps) {
  const rawBoardSlug = (await searchParams).board;
  const parsedBoardSlug = focusedBoardSlugSchema.safeParse(
    typeof rawBoardSlug === "string" ? rawBoardSlug : undefined,
  );
  const resolution = parsedBoardSlug.success
    ? await resolveCanonicalBoardRouteBySlug(parsedBoardSlug.data)
    : undefined;
  const focusedBoard = resolution
    ? {
        slug: resolution.item.slug,
        brand: resolution.item.brand,
        modelName: resolution.item.modelName,
      }
    : undefined;

  return (
    <div className={`${publicStyles.theme} ${styles.quizPage}`}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.quizShell}>
        <header className={styles.pageIntro}>
          <p className={publicStyles.kicker}>Персональный подбор</p>
          <h1>Подбор сноуборда под твои параметры</h1>
          <p>
            Укажи параметры райдера и расскажи, как катаешься. Ты получишь
            диапазон ростовок, рекомендуемую ширину и подборку моделей
            с объяснением выбора.
          </p>
        </header>
        <QuizFlow focusedBoard={focusedBoard} />
      </div>
    </div>
  );
}
