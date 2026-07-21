import type { Locale } from "next-intl";
import { redirect } from "@/i18n/navigation";

export default async function DashboardHome({
  params,
}: {
  params: Promise<{ locale: Locale; storeId: string }>;
}) {
  const { locale, storeId } = await params;
  redirect({ href: `/dashboard/${storeId}/products`, locale });
}
