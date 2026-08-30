"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatOrderDate,
  getDeliveryLabel,
  getOrderNumber,
  getShippingAddress,
} from "../lib/order-format";
import { paymentsLocked } from "../lib/order-status";
import { RegisterPaymentForm } from "./register-payment-form";
import { PaymentHistoryList } from "./payment-history-list";
import type { OrderResponseDto } from "@biasmarket/types";
import type { RegisterPaymentInput } from "../schemas/register-payment.schema";

export function OrderDetailSheet({
  open,
  onOpenChange,
  order,
  isPending,
  fulfillmentLabels: _fulfillmentLabels,
  enabledMethods,
  registerPaymentSubmitting,
  onRegisterPayment,
  onPreviewPayment,
  onApprove,
  onReject,
  onAdvance: _onAdvance,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderResponseDto | null;
  isPending: boolean;
  fulfillmentLabels: Record<string, string>;
  enabledMethods: string[];
  registerPaymentSubmitting: boolean;
  onRegisterPayment: (values: RegisterPaymentInput) => Promise<unknown>;
  onPreviewPayment: (url: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onAdvance: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("dashboard.orders");
  const { locale } = useParams<{ locale: string }>();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="lg"
        aria-label={
          order
            ? t("details.title", { number: getOrderNumber(order.id) })
            : t("details.title", { number: "" })
        }
        className="h-dvh gap-0 overflow-y-auto"
      >
        {order ? (
          <>
            <SheetHeader>
              <SheetTitle>
                {t("details.title", { number: getOrderNumber(order.id) })}
              </SheetTitle>
              <SheetDescription>
                {order.customerName ?? order.customerPhone}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-24 pt-4">
              <div className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-gradient-to-b from-[#fcf9ff] to-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#8f7da8]">
                    {t("details.total")}
                  </span>
                  <span className="font-bold text-[#2d1649]">
                    {order.currency} {order.totalAmount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#8f7da8]">
                    {t("details.paid")}
                  </span>
                  <span className="font-bold text-[#159a63]">
                    {order.currency} {order.paidAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#8f7da8]">
                    {t("details.pending")}
                  </span>
                  <span className="font-bold text-[#d11d52]">
                    {order.currency} {order.pendingAmount.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-2.5 border-t border-[#f3ebff] pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-[#2d1649]">
                      {t("details.progress")}
                    </span>
                    <span className="font-bold text-[var(--store-primary)]">
                      {Math.round(
                        order.fulfillmentStatus === "COMPLETED"
                          ? 100
                          : order.paidPercentage,
                      )}
                      %
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#f0e7f8] shadow-inner">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--store-accent)] to-[var(--store-primary)] transition-all duration-500"
                      style={{
                        width: `${
                          order.fulfillmentStatus === "COMPLETED"
                            ? 100
                            : order.paidPercentage
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t border-[#f3ebff] pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#8f7da8]">
                      {t("details.delivery")}
                    </span>
                    <span className="font-semibold text-[#2d1649]">
                      {getDeliveryLabel(order, t)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#8f7da8]">
                      {t("details.date")}
                    </span>
                    <span className="font-semibold text-[#2d1649]">
                      {formatOrderDate(order.createdAt, locale, t)}
                    </span>
                  </div>
                </div>

                {(() => {
                  const shippingAddress = getShippingAddress(order);
                  if (!shippingAddress) return null;
                  return (
                    <div className="space-y-1 border-t border-[#f3ebff] pt-3 text-sm">
                      <span className="font-medium text-[#8f7da8]">
                        {t("details.shippingAddress")}
                      </span>
                      <p className="font-semibold text-[#2d1649]">
                        {shippingAddress.recipientName} ·{" "}
                        {shippingAddress.phone}
                      </p>
                      <p className="text-[#2d1649]">
                        {shippingAddress.line1}
                        {shippingAddress.line2
                          ? `, ${shippingAddress.line2}`
                          : ""}
                      </p>
                      <p className="text-[#2d1649]">
                        {shippingAddress.city}
                        {shippingAddress.region
                          ? `, ${shippingAddress.region}`
                          : ""}
                      </p>
                      {shippingAddress.reference && (
                        <p className="text-[#8f7da8]">
                          {shippingAddress.reference}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-[#2d1649]">
                  <Wallet className="size-5 text-[var(--store-primary)]" />
                  <h3 className="font-semibold">{t("details.addPayment")}</h3>
                </div>

                {paymentsLocked(order) ? (
                  <Card className="rounded-2xl border-[#eadcf8] bg-[#fcf9ff] py-0 shadow-none">
                    <CardContent className="px-4 py-3 text-sm text-[#8f7da8]">
                      {t("details.paymentsLocked")}
                    </CardContent>
                  </Card>
                ) : (
                  <RegisterPaymentForm
                    pendingAmount={order.pendingAmount}
                    enabledMethods={enabledMethods}
                    submitting={registerPaymentSubmitting}
                    onSubmit={onRegisterPayment}
                  />
                )}

                <PaymentHistoryList
                  currency={order.currency}
                  payments={order.payments}
                  onPreview={onPreviewPayment}
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                  {t("details.items")}
                </p>
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between rounded-2xl border border-[#f0e7f8] bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#2d1649]">
                          {item.product.name}
                          {item.variant?.name ? ` (${item.variant.name})` : ""}
                        </p>
                        <p className="text-xs text-[#8f7da8]">
                          {t("details.quantity", { count: item.quantity })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <SheetFooter className="sticky bottom-0 border-t border-[#f0e7f8] bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex w-full flex-wrap gap-2">
                {!isPending &&
                  (order.paymentStatus === "PENDING_PAYMENT" ||
                    order.paymentStatus === "PAYMENT_SUBMITTED" ||
                    order.paymentStatus === "PARTIALLY_PAID") && (
                    <>
                      <Button
                        type="button"
                        onClick={onApprove}
                        disabled={order.paidAmount <= 0}
                        title={
                          order.paidAmount <= 0
                            ? order.paymentStatus === "PAYMENT_SUBMITTED"
                              ? t("approveReviewProof")
                              : t("approveDisabledNoPayment")
                            : undefined
                        }
                        className="store-theme-primary-button min-h-11 h-auto flex-1 rounded-2xl py-2.5 text-sm font-semibold whitespace-normal hover:opacity-100 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("approve")}
                      </Button>
                      {order.paidAmount <= 0 && (
                        <span className="sr-only">
                          {order.paymentStatus === "PAYMENT_SUBMITTED"
                            ? t("approveReviewProof")
                            : t("approveDisabledNoPayment")}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onReject}
                        className="min-h-11 h-auto flex-1 rounded-2xl border-[#eadcf7] bg-white py-2.5 text-sm font-semibold whitespace-normal text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                      >
                        {t("reject")}
                      </Button>
                    </>
                  )}
                {!isPending &&
                  order.status !== "CANCELLED" &&
                  order.paymentStatus !== "REJECTED" &&
                  order.fulfillmentStatus !== "COMPLETED" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onCancel}
                      className="min-h-11 h-auto flex-1 rounded-2xl border-red-200 py-2.5 whitespace-normal text-red-600 hover:bg-red-50"
                    >
                      {t("cancelOrder")}
                    </Button>
                  )}
              </div>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
