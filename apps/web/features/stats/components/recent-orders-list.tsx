"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { RecentOrder } from "../schemas/stats-overview.schema";

function formatOrderDate(
  createdAt: string,
  locale: string,
  t: ReturnType<typeof useTranslations>,
) {
  const date = new Date(createdAt);
  const now = new Date();
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  const isToday = now.toDateString() === date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();

  if (isToday) return t("date.today", { time });
  if (isYesterday) return t("date.yesterday", { time });

  const day = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
  }).format(date);
  return `${day} ${time}`;
}

function getOrderStatus(
  order: RecentOrder,
  t: ReturnType<typeof useTranslations>,
) {
  if (order.paymentStatus === "REJECTED") {
    return { label: t("status.rejected"), className: "bg-red-50 text-red-700" };
  }
  if (order.paymentStatus === "CANCELLED") {
    return {
      label: t("status.cancelled"),
      className: "bg-slate-100 text-slate-700",
    };
  }
  if (order.paymentStatus === "PARTIALLY_PAID") {
    return {
      label: t("status.partial"),
      className:
        "border border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50 text-sky-800 shadow-sm",
    };
  }
  if (order.paymentStatus !== "VERIFIED") {
    return {
      label: t("status.toConfirm"),
      className: "bg-violet-50 text-violet-700",
    };
  }
  if (order.fulfillmentStatus === "COMPLETED") {
    return {
      label: t("status.delivered"),
      className: "bg-emerald-50 text-emerald-700",
    };
  }
  if (
    order.fulfillmentStatus === "IN_TRANSIT" ||
    order.fulfillmentStatus === "READY"
  ) {
    return {
      label: t("status.inTransit"),
      className: "bg-pink-50 text-pink-700",
    };
  }
  return {
    label: t("status.pending"),
    className: "bg-amber-50 text-amber-700",
  };
}

export function RecentOrdersList(
  { orders, locale }: { orders: RecentOrder[]; locale: string },
) {
  const t = useTranslations("dashboard.overview");
  const tOrders = useTranslations("dashboard.orders");

  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-semibold text-[#2d1649]">
          {t("recentOrdersTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {orders.length === 0
          ? <EmptyState message={t("recentOrdersEmpty")} />
          : (
            <ul className="divide-y divide-[#f2e9fa]">
              {orders.map((order) => {
                const status = getOrderStatus(order, tOrders);
                return (
                  <li
                    key={order.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#2d1649]">
                        {order.customerName ?? order.customerPhone}
                      </p>
                      <p className="text-xs text-[#8f7da8]">
                        {formatOrderDate(order.createdAt, locale, tOrders)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-sm font-semibold text-[#2d1649]">
                        {order.currency} {order.totalAmount}
                      </p>
                      <Badge
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          status.className,
                        )}
                      >
                        {status.label}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </CardContent>
    </Card>
  );
}
