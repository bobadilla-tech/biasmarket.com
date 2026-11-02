import type { Locale } from "next-intl";
import { redirect } from "@/i18n/navigation";

export default async function PreferencesPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  redirect({ href: `/dashboard/${slug}/suggestions`, locale });
}
