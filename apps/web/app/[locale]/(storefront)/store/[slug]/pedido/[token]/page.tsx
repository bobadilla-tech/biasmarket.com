import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ApiError } from "@biasmarket/types";
import { apiClient } from "@/lib/api-client";
import { PublicOrderView } from "@/features/public-orders/components/public-order-view";
import { PublicOrderUnavailable } from "@/features/public-orders/components/public-order-unavailable";

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
  return {
    title: t("pageTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function PublicOrderPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string; token: string }>;
}) {
  const { locale, slug, token } = await params;

  try {
    const order = await apiClient.publicOrders.getByToken(token, {
      cache: "no-store",
    });
    // The opaque token is the credential, but the public URL is also scoped
    // to the store. Do not render an order under a different store's slug.
    if (order.store.slug !== slug) {
      return <PublicOrderUnavailable slug={slug} locale={locale} />;
    }
    return <PublicOrderView order={order} locale={locale} />;
  } catch (error) {
    // Missing, expired, rotated and revoked access links intentionally share
    // the API's 404 response and the same buyer-facing recovery message.
    if (error instanceof ApiError && error.status === 404) {
      return <PublicOrderUnavailable slug={slug} locale={locale} />;
    }
    return <PublicOrderUnavailable slug={slug} locale={locale} unavailable />;
  }
}
