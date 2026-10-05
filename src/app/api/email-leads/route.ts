import { publicApiError } from "@/lib/public-api-error";
import { NextResponse } from "next/server";
import { emailLeadSchema, saveEmailLead } from "@/lib/email-leads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let parsingInput = true;
  try {
    const payload = emailLeadSchema.parse(await request.json());
    parsingInput = false;
    const savedLead = await saveEmailLead(payload);

    return NextResponse.json({
      message: "Результат отправлен в список почтовых заявок.",
      leadId: savedLead?.id ?? null,
      quizResultId: savedLead?.quizResultId ?? null,
    });
  } catch (error) {
    return publicApiError("email-leads", error, parsingInput, "Проверь адрес почты и согласие.");
  }
}
