import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SetPasswordForm } from "@/features/customer-auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "storefront.accountConfirmPage",
  });
  return {
    title: t("setPassword.titleReset"),
    robots: { index: false, follow: false },
  };
}

export default async function GlobalResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  const t = await getTranslations({
    locale,
    namespace: "storefront.accountConfirmPage",
  });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-6 py-12 sm:px-10">
      {token ? (
        <SetPasswordForm token={token} purpose="reset" />
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-700">{t("errorTitle")}</p>
          <Link
            href="/my-purchases/forgot-password"
            className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline"
          >
            {t("requestNewLink")}
          </Link>
        </div>
      )}
    </div>
  );
}
