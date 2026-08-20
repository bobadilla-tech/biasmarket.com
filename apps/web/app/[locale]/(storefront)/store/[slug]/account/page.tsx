import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { canonicalUrl } from "@/lib/site-config";
import { CustomerAccountPageClient } from "./account-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({
    locale,
    namespace: "storefront.accountPage",
  });
  return {
    title: t("title"),
    alternates: { canonical: canonicalUrl(locale, `/store/${slug}/account`) },
  };
}

export default function CustomerAccountPage() {
  return <CustomerAccountPageClient />;
}
