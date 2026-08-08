"use client";

import { useTranslations } from "next-intl";
import type { CustomerProfileResponseDto } from "@biasmarket/types";
import { AccountOrderCard } from "./account-order-card";

export function AccountOrdersSection(
  { profile }: { profile: CustomerProfileResponseDto },
) {
  const t = useTranslations("storefront.accountPage");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-900">{t("ordersTitle")}</h1>
      {profile.orders.length === 0
        ? <p className="text-sm text-gray-500">{t("noOrders")}</p>
        : (
          <div className="flex flex-col gap-3">
            {profile.orders.map((order) => (
              <AccountOrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
    </div>
  );
}
