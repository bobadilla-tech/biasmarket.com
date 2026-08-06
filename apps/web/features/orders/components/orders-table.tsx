"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  formatOrderDate,
  getDeliveryLabel,
  getInitials,
  getOrderNumber,
  getProductSummary,
} from "../lib/order-format";
import { NEXT_FULFILLMENT } from "../lib/order-status";
import type { OrderResponseDto } from "@biasmarket/types";
import { OrderStatusBadge } from "./order-status-badge";

export function OrdersTable({
  orders,
  pendingOrderIds,
  fulfillmentLabels,
  onApprove,
  onReject,
  onAdvance,
  onView,
}: {
  orders: OrderResponseDto[];
  pendingOrderIds: Set<string>;
  fulfillmentLabels: Record<string, string>;
  onApprove: (order: OrderResponseDto) => void;
  onReject: (order: OrderResponseDto) => void;
  onAdvance: (order: OrderResponseDto) => void;
  onView: (order: OrderResponseDto) => void;
}) {
  const t = useTranslations("dashboard.orders");
  const { locale } = useParams<{ locale: string }>();

  if (orders.length === 0) {
    return (
      <div className="px-6 py-10 text-sm text-[#8f7da8]">{t("empty")}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#f3ebff] bg-[#fcf9ff] text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
            <th className="px-6 py-4">{t("columns.number")}</th>
            <th className="px-6 py-4">{t("columns.customer")}</th>
            <th className="px-6 py-4">{t("columns.product")}</th>
            <th className="px-6 py-4">{t("columns.total")}</th>
            <th className="px-6 py-4">{t("columns.delivery")}</th>
            <th className="px-6 py-4">{t("columns.date")}</th>
            <th className="px-6 py-4">{t("columns.status")}</th>
            <th className="px-6 py-4 text-right">{t("columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const number = getOrderNumber(order.id);
            const initials = getInitials(
              order.customerName,
              order.customerPhone,
            );
            const customer = order.customerName ?? order.customerPhone;
            const product = getProductSummary(order, t);
            const delivery = getDeliveryLabel(order, t);
            const date = formatOrderDate(order.createdAt, locale, t);
            const avatar = order.items?.[0]?.product?.images?.[0];
            const isPending = pendingOrderIds.has(order.id);
            const next = NEXT_FULFILLMENT[order.fulfillmentStatus];

            return (
              <tr
                key={order.id}
                className="border-b border-[#f3ebff] last:border-0 hover:bg-[#fcf9ff]"
              >
                <td className="px-6 py-4 text-xs font-semibold text-[#8f7da8]">
                  {number}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {avatar
                      ? (
                        <Image
                          className="size-9 rounded-full object-cover"
                          src={avatar}
                          alt={customer}
                          width={36}
                          height={36}
                        />
                      )
                      : (
                        <div
                          className="flex size-9 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                          style={{
                            background:
                              "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
                          }}
                        >
                          {initials}
                        </div>
                      )}
                    <p className="text-sm font-semibold text-[#2d1649]">
                      {customer}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-[#2d1649]">{product}</td>
                <td className="px-6 py-4 text-sm font-semibold text-[var(--store-accent)]">
                  {order.currency} {order.totalAmount}
                </td>
                <td className="px-6 py-4 text-sm text-[#8f7da8]">{delivery}</td>
                <td className="px-6 py-4 text-sm text-[#8f7da8]">{date}</td>
                <td className="px-6 py-4">
                  <OrderStatusBadge order={order} />
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {!isPending &&
                      (order.paymentStatus === "PENDING_PAYMENT" ||
                        order.paymentStatus === "PAYMENT_SUBMITTED") &&
                      (
                        <>
                          <Button
                            type="button"
                            onClick={() => onApprove(order)}
                            className="store-theme-primary-button h-8 rounded-full px-3 text-xs font-semibold hover:opacity-100"
                          >
                            {t("approve")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onReject(order)}
                            className="h-8 rounded-full border-[#eadcf7] bg-white px-3 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                          >
                            {t("reject")}
                          </Button>
                        </>
                      )}
                    {!isPending && order.paymentStatus === "VERIFIED" && next &&
                      (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onAdvance(order)}
                          className="h-8 rounded-full border-[#eadcf7] bg-white px-3 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                        >
                          {t("markAs", { status: fulfillmentLabels[next] })}
                        </Button>
                      )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onView(order)}
                      className="h-8 rounded-full border-[#eadcf7] bg-white px-4 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                    >
                      {t("view")}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
