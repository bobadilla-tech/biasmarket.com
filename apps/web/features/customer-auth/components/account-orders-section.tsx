"use client";

import { useTranslations } from "next-intl";
import type { CustomerProfileResponseDto } from "@biasmarket/types";
import { AccountOrderCard } from "./account-order-card";
import { ContactSellerButton } from "./contact-seller-button";

export function AccountOrdersSection(
  { slug, profile }: { slug: string; profile: CustomerProfileResponseDto },
) {
  const t = useTranslations("storefront.accountPage");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">{t("ordersTitle")}</h1>
        <ContactSellerButton slug={slug} />
      </div>
      {profile.orders.length === 0
        ? <p className="text-sm text-gray-500">{t("noOrders")}</p>
        : (
          <div className="flex flex-col gap-3">
            {profile.orders.map((order) => (
              <AccountOrderCard key={order.id} slug={slug} order={order} />
            ))}
          </div>
        )}
    </div>
  );
}
