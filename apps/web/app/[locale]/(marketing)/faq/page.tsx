import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { InfoPage } from "@/components/marketing/info-page";
import { canonicalUrl, localeAlternates } from "@/lib/site-config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "marketing.info.faq",
  });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: {
      canonical: canonicalUrl(locale, "/faq"),
      languages: localeAlternates("/faq"),
    },
  };
}

export default async function FaqRoute({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  return <InfoPage locale={locale} doc="faq" />;
}
