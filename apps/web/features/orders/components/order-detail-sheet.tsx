"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getOrderNumber, formatOrderDate, getDeliveryLabel } from "../lib/order-format";
import { NEXT_FULFILLMENT } from "../lib/order-status";
import { RegisterPaymentForm } from "./register-payment-form";
import { PaymentHistoryList } from "./payment-history-list";
import type { Order } from "../schemas/order.schema";
import type { RegisterPaymentInput } from "../schemas/register-payment.schema";

export function OrderDetailSheet({
  open,
  onOpenChange,
  order,
  isPending,
  fulfillmentLabels,
  enabledMethods,
  registerPaymentSubmitting,
  onRegisterPayment,
  onPreviewPayment,
  onApprove,
  onReject,
  onAdvance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  isPending: boolean;
  fulfillmentLabels: Record<string, string>;
  enabledMethods: string[];
  registerPaymentSubmitting: boolean;
  onRegisterPayment: (values: RegisterPaymentInput) => Promise<unknown>;
  onPreviewPayment: (url: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onAdvance: () => void;
}) {
  const t = useTranslations("dashboard.orders");
  const { locale } = useParams<{ locale: string }>();

  const next = order ? NEXT_FULFILLMENT[order.fulfillmentStatus] : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="h-dvh w-[420px] gap-0 overflow-y-auto sm:max-w-[420px]">
        {order ? (
          <>
            <SheetHeader>
              <SheetTitle>{t("details.title", { number: getOrderNumber(order.id) })}</SheetTitle>
              <SheetDescription>{order.customerName ?? order.customerPhone}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-24 pt-4">
              <div className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-gradient-to-b from-[#fcf9ff] to-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#8f7da8]">{t("details.total")}</span>
                  <span className="font-bold text-[#2d1649]">
                    {order.currency} {order.totalAmount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#8f7da8]">{t("details.paid")}</span>
                  <span className="font-bold text-[#159a63]">
                    {order.currency} {order.paidAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#8f7da8]">{t("details.pending")}</span>
                  <span className="font-bold text-[#d11d52]">
                    {order.currency} {order.pendingAmount.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-2.5 border-t border-[#f3ebff] pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-[#2d1649]">{t("details.progress")}</span>
                    <span className="font-bold text-[var(--store-primary)]">
                      {Math.round(order.paidPercentage)}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#f0e7f8] shadow-inner">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--store-accent)] to-[var(--store-primary)] transition-all duration-500"
                      style={{ width: `${order.paidPercentage}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t border-[#f3ebff] pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#8f7da8]">{t("details.delivery")}</span>
                    <span className="font-semibold text-[#2d1649]">{getDeliveryLabel(order, t)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#8f7da8]">{t("details.date")}</span>
                    <span className="font-semibold text-[#2d1649]">
                      {formatOrderDate(order.createdAt, locale, t)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-[#2d1649]">
                  <Wallet className="size-5 text-[var(--store-primary)]" />
                  <h3 className="font-semibold">{t("details.addPayment")}</h3>
                </div>

                <RegisterPaymentForm
                  pendingAmount={order.pendingAmount}
                  enabledMethods={enabledMethods}
                  submitting={registerPaymentSubmitting}
                  onSubmit={onRegisterPayment}
                />

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

            <SheetFooter className="sticky bottom-0 border-t border-[#f0e7f8] bg-white px-4 py-4">
              <div className="flex w-full flex-wrap gap-2">
                {!isPending &&
                  (order.paymentStatus === "PENDING_PAYMENT" || order.paymentStatus === "PAYMENT_SUBMITTED") && (
                    <>
                      <Button
                        type="button"
                        onClick={onApprove}
                        className="store-theme-primary-button h-11 flex-1 rounded-2xl text-sm font-semibold hover:opacity-100"
                      >
                        {t("approve")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onReject}
                        className="h-11 flex-1 rounded-2xl border-[#eadcf7] bg-white text-sm font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                      >
                        {t("reject")}
                      </Button>
                    </>
                  )}
                {!isPending && order.paymentStatus === "VERIFIED" && next ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onAdvance}
                    className="h-11 flex-1 rounded-2xl border-[#eadcf7] bg-white text-sm font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                  >
                    {t("markAs", { status: fulfillmentLabels[next] })}
                  </Button>
                ) : null}
              </div>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
