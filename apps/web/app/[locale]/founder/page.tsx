import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { FounderPage } from "@/components/marketing/founder-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.founderPage" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
  };
}

export default function Founder() {
  return <FounderPage />;
}
