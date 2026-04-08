import "server-only";
import { randomUUID } from "node:crypto";
import { базаНастроена } from "@/lib/database/config";
import { получитьКлиентБазы } from "@/lib/database/client";
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
    return;
  }

  const sql = получитьКлиентБазы();

  await sql`
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
  `;
}
