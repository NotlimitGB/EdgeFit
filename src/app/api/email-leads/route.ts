import { NextResponse } from "next/server";
import { emailLeadSchema, saveEmailLead } from "@/lib/email-leads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = emailLeadSchema.parse(await request.json());
    const savedLead = await saveEmailLead(payload);

    return NextResponse.json({
      message: "Результат отправлен в список почтовых заявок.",
      leadId: savedLead?.id ?? null,
      quizResultId: savedLead?.quizResultId ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить почту.",
      },
      { status: 400 },
    );
  }
}
