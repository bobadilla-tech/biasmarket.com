import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { MyPurchases } from "@/features/buyer-purchases";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "storefront.myPurchases",
  });
  // Per-buyer page behind a session cookie — nothing here to index.
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default function MyPurchasesPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-10">
      <MyPurchases />
    </div>
  );
}
