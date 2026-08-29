import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/features/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.login" });
  return { title: t("title") };
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex items-start justify-center bg-gray-50 px-4 py-10 sm:items-center">
      <LoginForm />
    </div>
  );
}
