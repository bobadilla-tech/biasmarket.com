"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import type { OutstandingPartialPaymentResponseDto } from "@biasmarket/types";

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`;
}

export function PartialPaymentsCard({
  orders,
}: {
  orders: OutstandingPartialPaymentResponseDto[];
}) {
  const t = useTranslations("dashboard.overview");

  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-semibold text-[#2d1649]">
          {t("partialPaymentsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {orders.length === 0
          ? <EmptyState message={t("partialPaymentsEmpty")} />
          : (
            <ul className="divide-y divide-[#f2e9fa]">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#2d1649]">
                      {order.customerName ?? order.customerPhone}
                    </p>
                    <p className="text-xs text-[#8f7da8]">
                      #{order.id.slice(-4).toUpperCase()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-[#8f7da8]">
                        {t("partialPayments.paid")}
                      </p>
                      <p className="text-sm font-semibold text-emerald-600">
                        {formatMoney(order.paidAmount, order.currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[#8f7da8]">
                        {t("partialPayments.remaining")}
                      </p>
                      <p className="text-sm font-bold text-[#2d1649]">
                        {formatMoney(order.pendingAmount, order.currency)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </CardContent>
    </Card>
  );
}
