import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmailVerifiedRedirect } from "@/features/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "onboarding.verifyEmail",
  });
  return {
    title: t("successTitle"),
    robots: { index: false, follow: false },
  };
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
    <div className="min-h-dvh flex items-start justify-center bg-gray-50 px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-3 text-center">
        {error ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">
              {t("errorTitle")}
            </h1>
            <p className="text-sm text-gray-600">
              {t(error === "TOKEN_EXPIRED" ? "expiredBody" : "errorBody")}
            </p>
            {/* Signing in with an unverified account re-sends the link
                (`sendOnSignIn` in apps/api auth.config.ts). */}
            <Link
              href="/login"
              className="text-emerald-600 font-medium hover:underline"
            >
              {t("requestNewLink")}
            </Link>
            <Link
              href="/onboarding"
              className="text-sm text-gray-500 hover:underline"
            >
              {t("signUpAgain")}
            </Link>
          </>
        ) : (
          <EmailVerifiedRedirect />
        )}
      </div>
    </div>
  );
}
