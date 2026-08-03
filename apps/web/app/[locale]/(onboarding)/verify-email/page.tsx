import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.verifyEmail" });
  return { title: t("successTitle") };
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations({
    locale,
    namespace: "onboarding.verifyEmail",
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-3 text-center">
        {error ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{t("errorTitle")}</h1>
            <p className="text-sm text-gray-600">{t("errorBody")}</p>
            <Link href="/onboarding" className="text-emerald-600 font-medium hover:underline">
              {t("signUpAgain")}
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{t("successTitle")}</h1>
            <p className="text-sm text-gray-600">{t("successBody")}</p>
            <Link href="/login" className="text-emerald-600 font-medium hover:underline">
              {t("backToLogin")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
