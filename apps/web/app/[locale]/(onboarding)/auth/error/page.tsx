import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthErrorScreen } from "@/features/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "onboarding.authError",
  });
  return { title: t("pageTitle"), robots: { index: false, follow: false } };
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh items-start justify-center bg-gray-50 px-6 py-10 sm:items-center">
      <AuthErrorScreen code={error} />
    </div>
  );
}
