import type { Locale } from "next-intl";
import { redirect } from "@/i18n/navigation";

export default async function AdminHome({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  redirect({ href: "/admin/inquiries", locale });
}
