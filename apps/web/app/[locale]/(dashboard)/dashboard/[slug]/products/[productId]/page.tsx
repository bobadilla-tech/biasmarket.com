import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ProductDetailsPageClient } from "./product-detail-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("products.details.eyebrow") };
}

export default function ProductDetailsPage() {
  return <ProductDetailsPageClient />;
}
