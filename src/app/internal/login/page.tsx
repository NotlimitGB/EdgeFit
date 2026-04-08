import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InternalLoginForm } from "@/components/internal/internal-login-form";
import {
  INTERNAL_ACCESS_COOKIE,
  isInternalAccessConfigured,
  isValidInternalAccessToken,
  normalizeInternalNextPath,
} from "@/lib/internal/access";

export const metadata: Metadata = {
  title: "Вход во внутреннюю часть",
  description:
    "Страница входа во внутренние разделы EdgeFit для управления каталогом и загрузкой данных.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function InternalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
  }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(INTERNAL_ACCESS_COOKIE)?.value;

  if (await isValidInternalAccessToken(token)) {
    redirect(normalizeInternalNextPath(params.next));
  }

  return <InternalLoginForm isConfigured={isInternalAccessConfigured()} />;
}
