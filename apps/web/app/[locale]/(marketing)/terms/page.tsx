import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/marketing/legal-page";
import { canonicalUrl, localeAlternates } from "@/lib/site-config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "marketing.legal.terms",
  });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: {
      canonical: canonicalUrl(locale, "/terms"),
      languages: localeAlternates("/terms"),
    },
  };
}

export default async function TermsRoute({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  return <LegalPage locale={locale} doc="terms" />;
}
