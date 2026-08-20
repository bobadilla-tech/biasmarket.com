import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ContactPage } from "@/components/marketing/contact-page";
import { canonicalUrl } from "@/lib/site-config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "marketing.contactPage",
  });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: { canonical: canonicalUrl(locale, "/contact") },
  };
}

export default function Contact() {
  return <ContactPage />;
}
