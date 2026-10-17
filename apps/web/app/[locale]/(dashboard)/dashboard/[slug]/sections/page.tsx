import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { isStorefrontRedesignEnabled } from "@/lib/storefront-redesign";
import { SectionsPageClient } from "./sections-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("sections.title") };
}

export default async function SectionsPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (isStorefrontRedesignEnabled(slug)) {
    redirect(`/${locale}/dashboard/${slug}/settings`);
  }
  return <SectionsPageClient />;
}
