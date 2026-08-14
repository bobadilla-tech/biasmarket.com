import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { OrderDetailPageClient } from "./order-detail-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "storefront.accountPage",
  });
  return {
    title: t("orderDetail.title"),
    robots: { index: false, follow: false },
  };
}

export default function OrderDetailPage() {
  return <OrderDetailPageClient />;
}
