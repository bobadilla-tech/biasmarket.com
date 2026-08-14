import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdminCouponsPageClient } from "./coupons-page-client.tsx";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.coupons" });
  return { title: t("title") };
}

export default function AdminCouponsPage() {
  return <AdminCouponsPageClient />;
}
