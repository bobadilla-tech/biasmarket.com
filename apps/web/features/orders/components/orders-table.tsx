"use client";

import Image from "next/image";
import { Fragment, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, UserRound } from "lucide-react";
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
import { paymentMethodLabels } from "../lib/payment-method-labels";

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
  const paymentMethods = paymentMethodLabels(t);
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
      <table className="w-full table-fixed text-sm md:table-auto">
        <DataTableCaption>{t("title")}</DataTableCaption>
        <thead>
          <tr className="border-b border-[#f3ebff] bg-[#fcf9ff] text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
            <th
              aria-hidden="true"
              className="hidden w-11 px-2 py-4 md:table-cell"
            />
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
              className="hidden sticky right-0 bg-[#fcf9ff] px-3 py-4 text-right md:table-cell md:static md:px-6"
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
            const customerName = order.customerName?.trim();
            const customer =
              customerName || order.customerPhone || t("unnamedCustomer");
            const mobileCustomer = customerName
              ? customerName
              : order.customerPhone
                ? t("maskedPhone", { phone: order.customerPhone.slice(-4) })
                : t("unnamedCustomer");
            const product = getProductSummary(order, t);
            const delivery = getDeliveryLabel(order, t);
            const date = order.createdAt
              ? formatOrderDate(order.createdAt, locale, t)
              : "—";
            const avatar = order.items?.[0]?.product?.images?.[0];
            const isPending = pendingOrderIds.has(order.id);
            const next = NEXT_FULFILLMENT[order.fulfillmentStatus];
            const expanded = expandedOrderIds.has(order.id);
            const detailsId = `order-details-${order.id}`;

            return (
              <Fragment key={order.id}>
                <tr className="border-b border-[#f3ebff] md:hidden">
                  <td colSpan={9} className="p-3">
                    <article className="overflow-hidden rounded-2xl border border-[#eadcf8] bg-white shadow-[0_8px_22px_-20px_rgba(45,22,73,0.7)]">
                      <div className="flex items-start justify-between gap-3 border-b border-[#f3ebff] bg-[#fcf9ff] px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#927fac]">
                            {t("mobileOrder")}
                          </p>
                          <p className="truncate text-base font-bold text-[#2d1649]">
                            {number}
                          </p>
                        </div>
                        <OrderStatusBadge order={order} />
                      </div>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 px-4 py-4">
                        <div className="min-w-0">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.customer")}
                          </dt>
                          <dd className="mt-0.5 truncate text-sm font-semibold text-[#2d1649]">
                            {mobileCustomer}
                          </dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.date")}
                          </dt>
                          <dd className="mt-0.5 whitespace-nowrap text-sm text-[#5e4a75]">
                            {date || "—"}
                          </dd>
                        </div>
                        <div className="col-span-2 flex items-end justify-between gap-3 border-t border-[#f3ebff] pt-3">
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#8f7da8]">
                              {t("columns.total")}
                            </dt>
                            <dd className="mt-0.5 min-w-0 break-words text-lg font-bold tabular-nums text-[var(--store-accent)]">
                              {order.currency && order.totalAmount
                                ? `${order.totalAmount} ${order.currency}`
                                : "—"}
                            </dd>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-expanded={expanded}
                              aria-controls={detailsId}
                              aria-label={t("details.title", { number })}
                              onClick={() =>
                                setExpandedOrderIds((current) => {
                                  const nextIds = new Set(current);
                                  if (nextIds.has(order.id))
                                    nextIds.delete(order.id);
                                  else nextIds.add(order.id);
                                  return nextIds;
                                })
                              }
                              className="rounded-full text-[#2d1649] hover:bg-[#f3ebff]"
                            >
                              {expanded ? (
                                <ChevronDown aria-hidden="true" />
                              ) : (
                                <ChevronRight aria-hidden="true" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => onView(order)}
                              className="min-h-9 rounded-full border-[#eadcf7] bg-white px-4 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                            >
                              {t("view")}
                            </Button>
                          </div>
                        </div>
                      </dl>
                    </article>
                  </td>
                </tr>
                <tr className="hidden border-b border-[#f3ebff] hover:bg-[#fcf9ff] md:table-row">
                  <td className="hidden w-11 px-2 py-4 md:table-cell">
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
                          {initials || (
                            <UserRound aria-hidden="true" className="size-4" />
                          )}
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
                            {mobileCustomer}
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
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.payment")}
                          </dt>
                          <dd className="text-[#2d1649]">
                            {order.paymentMethod
                              ? paymentMethods[order.paymentMethod]
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-[#8f7da8]">
                            {t("columns.paymentStatus")}
                          </dt>
                          <dd className="text-[#2d1649]">
                            {t(`paymentStatusLabels.${order.paymentStatus}`)}
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
