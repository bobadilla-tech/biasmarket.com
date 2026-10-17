import { Suspense } from "react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { OrdersPageClient } from "./orders-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard.orders" });
  return { title: t("title") };
}

export default function OrdersPage() {
  // useSearchParams (the ?order= deep link) needs a Suspense boundary.
  return (
    <Suspense>
      <OrdersPageClient />
    </Suspense>
  );
}
