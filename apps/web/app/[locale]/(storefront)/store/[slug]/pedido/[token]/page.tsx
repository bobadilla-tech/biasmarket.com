import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PublicOrderPage } from "@/features/public-order";

// This page makes no API call on purpose: the browser fetches the order, so
// link-preview crawlers (which do not run JS) never count as the first open
// that locks "Corregir numero". Do not add a fetch here.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "storefront.publicOrder",
  });
  // Generic on purpose: no order data in previews, and the URL is private.
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title: t("metaTitle"), description: t("metaDescription") },
    twitter: { title: t("metaTitle"), description: t("metaDescription") },
  };
}

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  return <PublicOrderPage slug={slug} token={token} />;
}
