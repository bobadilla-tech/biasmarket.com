"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import {
  buildWhatsAppPaymentReminderMessage,
  buildWhatsAppUrl,
} from "@biasmarket/utils/whatsapp";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { useDashboardStore } from "@/features/stores";
import type { OrderResponseDto } from "@biasmarket/types";
import { PaymentMethodsBreakdown } from "@/features/stats";
import {
  ConfirmTransitionDialog,
  formatOrderDate,
  getInitials,
  getOrderNumber,
  OrderStatusBadge,
  useOrders,
  useReviewPayment,
} from "@/features/orders";

const PAYMENT_ATTENTION_STATUSES = new Set([
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PAYMENT_SUBMITTED",
]);

export function PaymentsPageClient() {
  const t = useTranslations("dashboard.payments");
  const tOrders = useTranslations("dashboard.orders");
  const tCommon = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const { store, storeId, loading: storeLoading } = useDashboardStore();
  const { data: orders, isPending: ordersLoading, error } = useOrders(
    storeId,
    tCommon("networkError"),
  );
  const reviewPayment = useReviewPayment(storeId, tCommon("networkError"));

  const [confirmTarget, setConfirmTarget] = useState<
    {
      orderId: string;
      decision: "approve" | "reject";
    } | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");

  const paymentActionLabels: Record<"approve" | "reject", string> = {
    approve: tOrders("paymentActionLabels.approve"),
    reject: tOrders("paymentActionLabels.reject"),
  };

  const paymentOrders = useMemo(
    () =>
      (orders ?? []).filter((order) =>
        PAYMENT_ATTENTION_STATUSES.has(order.paymentStatus)
      ),
    [orders],
  );

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    await reviewPayment.mutateAsync({
      orderId: confirmTarget.orderId,
      decision: confirmTarget.decision,
      ...(confirmTarget.decision === "reject" &&
        { reason: rejectReason.trim() }),
    });
    setConfirmTarget(null);
    setRejectReason("");
  };

  const contactBuyerUrl = (order: OrderResponseDto) =>
    buildWhatsAppUrl(
      order.customerPhone,
      buildWhatsAppPaymentReminderMessage({
        orderId: order.id,
        storeName: store?.name ?? "",
        pendingAmount: order.pendingAmount,
        currency: order.currency,
        customerName: order.customerName,
      }),
    );

  if (storeLoading || ordersLoading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="px-5 py-6 lg:px-8 lg:py-8">
        <ErrorState
          message={error instanceof Error
            ? error.message
            : tCommon("networkError")}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[#8e7ca7]">{t("subtitle")}</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
            {t("titleWithCount", { count: paymentOrders.length })}
          </h1>
        </div>

        <Card className="overflow-x-auto rounded-[30px] border-[#eadcf8] bg-white py-0 shadow-sm">
          <CardContent className="px-0">
            {paymentOrders.length === 0
              ? <EmptyState message={t("empty")} />
              : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#f3ebff] bg-[#fcf9ff] text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                      <th className="px-6 py-4">{tOrders("columns.number")}</th>
                      <th className="px-6 py-4">
                        {tOrders("columns.customer")}
                      </th>
                      <th className="px-6 py-4">{t("columns.paid")}</th>
                      <th className="px-6 py-4">{t("columns.pending")}</th>
                      <th className="px-6 py-4">{t("columns.progress")}</th>
                      <th className="px-6 py-4">{tOrders("columns.status")}</th>
                      <th className="px-6 py-4 text-right">
                        {tOrders("columns.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentOrders.map((order) => {
                      const number = getOrderNumber(order.id);
                      const initials = getInitials(
                        order.customerName,
                        order.customerPhone,
                      );
                      const customer = order.customerName ??
                        order.customerPhone;
                      const date = formatOrderDate(
                        order.createdAt,
                        locale,
                        tOrders,
                      );
                      const needsReview =
                        order.paymentStatus === "PENDING_PAYMENT" ||
                        order.paymentStatus === "PAYMENT_SUBMITTED";

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
                              <div
                                className="flex size-9 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                                style={{
                                  background:
                                    "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
                                }}
                              >
                                {initials}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-[#2d1649]">
                                  {customer}
                                </p>
                                <p className="text-xs text-[#8f7da8]">{date}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-[#159a63]">
                            {order.currency} {order.paidAmount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-[#d11d52]">
                            {order.currency} {order.pendingAmount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#8f7da8]">
                            {Math.round(order.paidPercentage)}%
                          </td>
                          <td className="px-6 py-4">
                            <OrderStatusBadge order={order} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {needsReview && (
                                <>
                                  <Button
                                    type="button"
                                    onClick={() =>
                                      setConfirmTarget({
                                        orderId: order.id,
                                        decision: "approve",
                                      })}
                                    disabled={order.paidAmount <= 0}
                                    title={order.paidAmount <= 0
                                      ? tOrders("approveDisabledNoPayment")
                                      : undefined}
                                    className="store-theme-primary-button h-8 rounded-full px-3 text-xs font-semibold hover:opacity-100 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {tOrders("approve")}
                                  </Button>
                                  {order.paidAmount <= 0 && (
                                    <span className="sr-only">
                                      {tOrders("approveDisabledNoPayment")}
                                    </span>
                                  )}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                      setConfirmTarget({
                                        orderId: order.id,
                                        decision: "reject",
                                      })}
                                    className="h-8 rounded-full border-[#eadcf7] bg-white px-3 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                                  >
                                    {tOrders("reject")}
                                  </Button>
                                </>
                              )}
                              {order.paymentStatus === "PARTIALLY_PAID" && (
                                <a
                                  href={contactBuyerUrl(order)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 gap-1.5 rounded-full border-[#eadcf7] bg-white px-3 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                                  >
                                    <MessageCircle className="size-3.5" />
                                    {t("contactBuyer")}
                                  </Button>
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </CardContent>
        </Card>

        <PaymentMethodsBreakdown
          storeId={storeId}
          currency={store?.defaultCurrency ?? "PEN"}
        />
      </div>

      <ConfirmTransitionDialog
        open={!!confirmTarget}
        label={confirmTarget
          ? paymentActionLabels[confirmTarget.decision]
          : null}
        pending={reviewPayment.isPending}
        onCancel={() => {
          setConfirmTarget(null);
          setRejectReason("");
        }}
        onConfirm={handleConfirm}
        {...(confirmTarget?.decision === "reject" && {
          reason: rejectReason,
          onReasonChange: setRejectReason,
          reasonRequired: true,
        })}
      />
    </div>
  );
}
