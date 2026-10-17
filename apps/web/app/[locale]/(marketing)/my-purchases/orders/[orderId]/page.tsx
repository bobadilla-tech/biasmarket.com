import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { MyPurchaseOrder } from "@/features/buyer-purchases";

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

// The page itself fetches nothing: the order is loaded in the browser, where
// the host-only buyer session cookie exists.
export default async function MyPurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ claimed?: string | string[] }>;
}) {
  const { orderId } = await params;
  const { claimed } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-10">
      <MyPurchaseOrder orderId={orderId} justClaimed={claimed === "1"} />
    </div>
  );
}
