import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { StoreDirectoryPageClient } from "./store-directory-page-client";
import { canonicalUrl } from "@/lib/site-config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "storefront.storeDirectory",
  });
  return {
    title: t("title"),
    alternates: { canonical: canonicalUrl(locale, "/stores") },
  };
}

export default function StoreDirectoryPage() {
  return <StoreDirectoryPageClient />;
}
