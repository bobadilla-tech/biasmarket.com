import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdminInquiriesPageClient } from "./inquiries-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.inquiries" });
  return { title: t("title") };
}

export default function AdminInquiriesPage() {
  return <AdminInquiriesPageClient />;
}
