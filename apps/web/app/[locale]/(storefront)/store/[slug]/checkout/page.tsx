import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { CheckoutPageClient } from "./checkout-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "storefront.checkoutPage" });
  return { title: t("title") };
}

export default function CheckoutPage() {
  return <CheckoutPageClient />;
}
