import "server-only";
import { z } from "zod";
import { базаНастроена } from "@/lib/database/config";
import { получитьКлиентБазы } from "@/lib/database/client";

export const emailLeadSchema = z.object({
  email: z.string().trim().email("Укажите корректный адрес почты."),
  consent: z
    .boolean()
    .refine((value) => value, "Нужно согласие на получение результата по почте."),
  source: z.string().trim().min(1).max(120),
  sessionId: z.string().trim().min(1).max(120).optional(),
});

export type EmailLeadInput = z.infer<typeof emailLeadSchema>;

export async function saveEmailLead({
  email,
  consent,
  source,
  sessionId,
}: EmailLeadInput) {
  if (!базаНастроена()) {
    return null;
  }

  const sql = получитьКлиентБазы();

  const latestQuizResult = sessionId
    ? await sql<{ id: string }[]>`
        select id::text as "id"
        from quiz_results
        where session_id = ${sessionId}
        order by created_at desc
        limit 1
      `
    : [];

  const quizResultId = latestQuizResult[0]?.id ?? null;

  const [savedLead] = await sql<{ id: string; quizResultId: string | null }[]>`
    insert into email_leads (
      email,
      source,
      quiz_result_id,
      consent
    ) values (
      ${email.trim().toLowerCase()},
      ${source},
      ${quizResultId},
      ${consent}
    )
    on conflict (email) do update set
      source = excluded.source,
      quiz_result_id = coalesce(excluded.quiz_result_id, email_leads.quiz_result_id),
      consent = email_leads.consent or excluded.consent
    returning id::text as "id", quiz_result_id::text as "quizResultId"
  `;

  return savedLead;
}
