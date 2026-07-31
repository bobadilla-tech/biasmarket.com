import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { EnterprisePage } from "@/components/marketing/enterprise-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.enterprisePage" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
  };
}

export default function Enterprise() {
  return <EnterprisePage />;
}
