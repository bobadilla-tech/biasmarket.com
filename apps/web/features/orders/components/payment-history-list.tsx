"use client";

import { Receipt } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatOrderDate } from "../lib/order-format";
import type { OrderPaymentRow } from "../schemas/order.schema";

export function PaymentHistoryList({
  currency,
  payments,
  onPreview,
}: {
  currency: string;
  payments: OrderPaymentRow[];
  onPreview: (url: string) => void;
}) {
  const t = useTranslations("dashboard.orders");
  const { locale } = useParams<{ locale: string }>();

  const paymentMethodLabels: Record<string, string> = {
    YAPE: t("paymentMethodLabels.YAPE"),
    PLIN: t("paymentMethodLabels.PLIN"),
    TRANSFER: t("paymentMethodLabels.TRANSFER"),
    CASH: t("paymentMethodLabels.CASH"),
  };

  if (payments.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-[#f3ebff] pt-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#927fac]">
        {t("details.paymentHistory")}
      </p>
      <div className="space-y-2">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="flex items-start gap-3 rounded-xl border border-[#f0e7f8] bg-[#fcf9ff] p-3 transition hover:bg-white"
          >
            <div
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f0e7f8] text-[var(--store-primary)]",
                payment.imageUrl ? "cursor-pointer" : "",
              )}
              onClick={() => {
                if (payment.imageUrl) onPreview(payment.imageUrl);
              }}
            >
              {payment.imageUrl ? (
                <img src={payment.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Receipt className="size-3.5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#2d1649]">
                  {currency} {payment.amount}
                  {payment.method ? (
                    <span className="ml-1 font-medium text-[#8f7da8]">
                      · {paymentMethodLabels[payment.method] ?? payment.method}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] font-medium text-[#8f7da8]">
                  {formatOrderDate(payment.createdAt, locale, t)}
                </span>
              </div>
              {payment.note ? <p className="mt-1 truncate text-xs text-[#6e5a87]">{payment.note}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
