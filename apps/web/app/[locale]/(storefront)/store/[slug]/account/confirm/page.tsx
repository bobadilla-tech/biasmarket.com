import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AccountConfirmPageClient } from "./account-confirm-page-client";

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
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default function AccountConfirmPage() {
  return <AccountConfirmPageClient />;
}
