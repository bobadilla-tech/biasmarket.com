import type { Locale } from "next-intl";
import { redirect } from "@/i18n/navigation";

export default async function DashboardHome({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  redirect({ href: `/dashboard/${slug}/products`, locale });
}
