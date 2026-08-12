import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ForSellersPage } from "@/features/for-sellers";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "forSellers.meta",
  });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function ForSellers() {
  return <ForSellersPage />;
}
