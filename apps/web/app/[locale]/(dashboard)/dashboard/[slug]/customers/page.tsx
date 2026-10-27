import type { Metadata } from "next";
import { Suspense } from "react";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LoadingState } from "@/components/shared/loading-state";
import { CustomersPageClient } from "./customers-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard.customers" });
  return { title: t("title") };
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CustomersPageClient />
    </Suspense>
  );
}
