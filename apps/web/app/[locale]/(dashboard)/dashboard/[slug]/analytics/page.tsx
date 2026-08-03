import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AnalyticsPageClient } from "./analytics-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard.analytics" });
  return { title: t("title") };
}

export default function AnalyticsPage() {
  return <AnalyticsPageClient />;
}
