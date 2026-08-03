import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ProductSearchPageClient } from "./search-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "storefront.productSearch" });
  return { title: t("title") };
}

export default function ProductSearchPage() {
  return <ProductSearchPageClient />;
}
