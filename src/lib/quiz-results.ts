import "server-only";
import { randomUUID } from "node:crypto";
import { базаНастроена } from "@/lib/database/config";
import { получитьКлиентБазы } from "@/lib/database/client";
import {
  generateSavedResultToken,
  hashSavedResultToken,
  isSavedResultsEnabled,
} from "@/lib/saved-results";
import type { QuizInput, RecommendationResult } from "@/types/domain";

interface ПараметрыСохраненияРезультата {
  вход: QuizInput;
  результат: RecommendationResult;
  идентификаторСессии?: string | null;
}

export async function сохранитьРезультатКвиза({
  вход,
  результат,
  идентификаторСессии,
}: ПараметрыСохраненияРезультата) {
  if (!базаНастроена()) {
    return null;
  }

  const sql = получитьКлиентБазы();

  const [savedResult] = await sql<{ id: string }[]>`
    insert into quiz_results (
      session_id,
      height_cm,
      weight_kg,
      boot_size_eu,
      board_line_preference,
      riding_style,
      skill_level,
      terrain_priority,
      aggressiveness,
      stance_type,
      result_length_min,
      result_length_max,
      result_width_type,
      result_target_waist_width_mm,
      result_boot_drag_risk,
      algorithm_version,
      recommended_snapshot
    ) values (
      ${идентификаторСессии?.trim() || randomUUID()},
      ${вход.heightCm},
      ${вход.weightKg},
      ${вход.bootSizeEu},
      ${вход.boardLinePreference},
      ${вход.ridingStyle},
      ${вход.skillLevel},
      ${вход.terrainPriority},
      ${вход.aggressiveness},
      ${вход.stanceType},
      ${результат.lengthRange.min},
      ${результат.lengthRange.max},
      ${результат.recommendedWidthType},
      ${результат.targetWaistWidthMm},
      ${результат.bootDragRisk},
      ${результат.algorithmVersion},
      ${JSON.stringify(
        результат.recommendedBoards.map((совпадение) => ({
          productId: совпадение.product.id,
          slug: совпадение.product.slug,
          sizeCm: совпадение.size.sizeCm,
          sizeLabel: совпадение.size.sizeLabel ?? null,
          widthType: совпадение.size.widthType,
          score: совпадение.score,
          fitLabel: совпадение.fitLabel,
        })),
      )}::jsonb
    )
    returning id::text as "id"
  `;

  if (!isSavedResultsEnabled() || !savedResult?.id) {
    return null;
  }

  const publicToken = generateSavedResultToken();
  const publicTokenHash = hashSavedResultToken(publicToken);

  try {
    const updatedRows = await sql<{ id: string }[]>`
      update quiz_results
      set
        public_token_hash = ${publicTokenHash},
        result_snapshot = ${sql.json(
          результат as unknown as Parameters<typeof sql.json>[0],
        )}
      where id = ${savedResult.id}::uuid
        and public_token_hash is null
        and result_snapshot is null
      returning id::text as "id"
    `;

    if (updatedRows[0]?.id) {
      return publicToken;
    }

    console.error("Saved result persistence skipped.", {
      category: "saved_result_update_missing",
    });
  } catch (error) {
    console.error("Saved result persistence unavailable.", {
      category: "saved_result_update_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  return null;
}
