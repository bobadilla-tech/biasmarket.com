"use client";

import Image from "next/image";
import { Fragment, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableCaption } from "@/components/ui/data-table";
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
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );

  if (orders.length === 0) {
    return (
      <div className="px-6 py-10 text-sm text-[#8f7da8]">{t("empty")}</div>
    );
  }

  return (
    <DataTable caption={t("title")}>
      <table className="w-full text-sm">
        <DataTableCaption>{t("title")}</DataTableCaption>
        <thead>
          <tr className="border-b border-[#f3ebff] bg-[#fcf9ff] text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
            <th aria-hidden="true" className="w-11 px-2 py-4 md:hidden" />
            <th scope="col" className="hidden px-6 py-4 md:table-cell">
              {t("columns.number")}
            </th>
            <th scope="col" className="hidden px-6 py-4 md:table-cell">
              {t("columns.customer")}
            </th>
            <th scope="col" className="hidden px-6 py-4 md:table-cell">
              {t("columns.product")}
            </th>
            <th scope="col" className="hidden px-6 py-4 md:table-cell">
              {t("columns.total")}
            </th>
            <th scope="col" className="hidden px-6 py-4 md:table-cell">
              {t("columns.delivery")}
            </th>
            <th scope="col" className="hidden px-6 py-4 md:table-cell">
              {t("columns.date")}
            </th>
            <th scope="col" className="hidden px-6 py-4 md:table-cell">
              {t("columns.status")}
            </th>
            <th
              scope="col"
              className="sticky right-0 bg-[#fcf9ff] px-3 py-4 text-right md:static md:px-6"
            >
              {t("columns.actions")}
            </th>
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
            const expanded = expandedOrderIds.has(order.id);
            const detailsId = `order-details-${order.id}`;

            return (
              <Fragment key={order.id}>
                <tr className="border-b border-[#f3ebff] hover:bg-[#fcf9ff]">
                  <td className="w-11 px-2 py-4 md:hidden">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-expanded={expanded}
                      aria-controls={detailsId}
                      aria-label={t("details.title", { number })}
                      onClick={() => {
                        setExpandedOrderIds((current) => {
                          const nextIds = new Set(current);
                          if (nextIds.has(order.id)) nextIds.delete(order.id);
                          else nextIds.add(order.id);
                          return nextIds;
                        });
                      }}
                      className="text-[#2d1649]"
                    >
                      {expanded ? (
                        <ChevronDown aria-hidden="true" />
                      ) : (
                        <ChevronRight aria-hidden="true" />
                      )}
                    </Button>
                  </td>
                  <td className="hidden px-6 py-4 text-xs font-semibold text-[#8f7da8] md:table-cell">
                    {number}
                  </td>
                  <td className="hidden px-6 py-4 md:table-cell">
                    <div className="flex items-center gap-3">
                      {avatar ? (
                        <Image
                          className="size-9 rounded-full object-cover"
                          src={avatar}
                          alt={customer}
                          width={36}
                          height={36}
                        />
                      ) : (
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
                  <td className="hidden px-6 py-4 text-sm text-[#2d1649] md:table-cell">
                    {product}
                  </td>
                  <td className="hidden px-6 py-4 text-sm font-semibold text-[var(--store-accent)] md:table-cell">
                    {order.currency} {order.totalAmount}
                  </td>
                  <td className="hidden px-6 py-4 text-sm text-[#8f7da8] md:table-cell">
                    {delivery}
                  </td>
                  <td className="hidden px-6 py-4 text-sm text-[#8f7da8] md:table-cell">
                    {date}
                  </td>
                  <td className="hidden px-6 py-4 md:table-cell">
                    <OrderStatusBadge order={order} />
                  </td>
                  <td className="sticky right-0 bg-white px-3 py-4 text-right md:static md:px-6">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {!isPending &&
                        (order.paymentStatus === "PENDING_PAYMENT" ||
                          order.paymentStatus === "PAYMENT_SUBMITTED") && (
                          <>
                            <Button
                              type="button"
                              onClick={() => onApprove(order)}
                              disabled={order.paidAmount <= 0}
                              title={
                                order.paidAmount <= 0
                                  ? t("approveDisabledNoPayment")
                                  : undefined
                              }
                              className="store-theme-primary-button min-h-8 h-auto rounded-full px-3 py-1.5 text-xs font-semibold whitespace-normal hover:opacity-100 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {t("approve")}
                            </Button>
                            {order.paidAmount <= 0 && (
                              <span className="sr-only">
                                {t("approveDisabledNoPayment")}
                              </span>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => onReject(order)}
                              className="min-h-8 h-auto rounded-full border-[#eadcf7] bg-white px-3 py-1.5 text-xs font-semibold whitespace-normal text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                            >
                              {t("reject")}
                            </Button>
                          </>
                        )}
                      {!isPending &&
                        order.paymentStatus === "VERIFIED" &&
                        next && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onAdvance(order)}
                            className="min-h-8 h-auto rounded-full border-[#eadcf7] bg-white px-3 py-1.5 text-xs font-semibold whitespace-normal text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                          >
                            {t("markAs", { status: fulfillmentLabels[next] })}
                          </Button>
                        )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onView(order)}
                        className="min-h-8 h-auto rounded-full border-[#eadcf7] bg-white px-4 py-1.5 text-xs font-semibold whitespace-normal text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                      >
                        {t("view")}
                      </Button>
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr
                    id={detailsId}
                    role="row"
                    aria-label={number}
                    className="border-b border-[#f3ebff] bg-[#fcf9ff] md:hidden"
                  >
                    <td colSpan={9} aria-label={number} className="px-4 py-4">
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.number")}
                          </dt>
                          <dd className="font-semibold text-[#2d1649]">
                            {number}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.customer")}
                          </dt>
                          <dd className="font-semibold text-[#2d1649]">
                            {customer}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.product")}
                          </dt>
                          <dd className="text-[#2d1649]">{product}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.total")}
                          </dt>
                          <dd className="font-semibold text-[#2d1649]">
                            {order.currency} {order.totalAmount}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.delivery")}
                          </dt>
                          <dd className="text-[#2d1649]">{delivery}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.date")}
                          </dt>
                          <dd className="text-[#2d1649]">{date}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.status")}
                          </dt>
                          <dd>
                            <OrderStatusBadge order={order} />
                          </dd>
                        </div>
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </DataTable>
  );
}
