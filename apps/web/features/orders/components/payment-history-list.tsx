"use client";

import { Receipt } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatOrderDate } from "../lib/order-format";
import { paymentMethodLabels } from "../lib/payment-method-labels";
import { ordersApi } from "../api/orders.api";
import { useReviewPaymentProof } from "../mutations/use-review-payment-proof";
import type { OrderPaymentResponseDto } from "@biasmarket/types";

function ProofReviewBadge(
  { reviewStatus, t }: {
    reviewStatus: OrderPaymentResponseDto["reviewStatus"];
    t: ReturnType<typeof useTranslations<"dashboard.orders">>;
  },
) {
  const styles: Record<string, string> = {
    PENDING_REVIEW: "bg-amber-50 text-amber-600",
    APPROVED: "bg-emerald-50 text-emerald-600",
    REJECTED: "bg-rose-50 text-rose-600",
  };
  const style = styles[reviewStatus];
  if (!style) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}
    >
      {t(`proofReview.${
        reviewStatus === "PENDING_REVIEW"
          ? "pending"
          : reviewStatus === "APPROVED"
          ? "approved"
          : "rejected"
      }`)}
    </span>
  );
}

// Tiny inline logo for the branded methods (Yape/Plin); TRANSFER/CASH have no
// brand asset and stay text-only. Decorative next to the text label, so
// alt="" — the label right after it carries the accessible name.
const PAYMENT_METHOD_LOGOS: Record<
  string,
  { src: string; width: number; height: number }
> = {
  YAPE: { src: "/logos/integrations/yape.webp", width: 200, height: 200 },
  PLIN: { src: "/logos/integrations/plin.png", width: 185, height: 185 },
};

export function PaymentHistoryList({
  currency,
  payments,
  onPreview,
}: {
  currency: string;
  payments: OrderPaymentResponseDto[];
  onPreview: (url: string) => void;
}) {
  const t = useTranslations("dashboard.orders");
  const { locale } = useParams<{ locale: string }>();

  const labels = paymentMethodLabels(t);
  const storeId = payments[0]?.storeId ?? "";
  const reviewProof = useReviewPaymentProof(storeId);

  if (payments.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-[#f3ebff] pt-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#927fac]">
        {t("details.paymentHistory")}
      </p>
      <div className="space-y-2">
        {payments.map((payment) => {
          const imageUrl = payment.imageUrl
            ? ordersApi.paymentImageUrl(
              payment.storeId,
              payment.orderId,
              payment.id,
            )
            : null;
          const methodLogo = payment.method
            ? PAYMENT_METHOD_LOGOS[payment.method]
            : undefined;
          return (
            <div
              key={payment.id}
              className="flex items-start gap-3 rounded-xl border border-[#f0e7f8] bg-[#fcf9ff] p-3 transition hover:bg-white"
            >
              {imageUrl
                ? (
                  <button
                    type="button"
                    onClick={() => onPreview(imageUrl)}
                    aria-label={t("details.viewPaymentProof")}
                    className="mt-0.5 flex size-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[#f0e7f8] text-[var(--store-primary)]"
                  >
                    <Image
                      src={imageUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  </button>
                )
                : (
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f0e7f8] text-[var(--store-primary)]">
                    <Receipt className="size-3.5" />
                  </div>
                )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1.5 font-bold text-[#2d1649]">
                    {currency} {payment.amount}
                    {payment.method
                      ? (
                        <span className="inline-flex items-center gap-1 font-medium text-[#8f7da8]">
                          <span aria-hidden="true">·</span>
                          {methodLogo && (
                            <Image
                              src={methodLogo.src}
                              alt=""
                              width={methodLogo.width}
                              height={methodLogo.height}
                              className="size-3.5 shrink-0 object-contain"
                            />
                          )}
                          {labels[payment.method] ?? payment.method}
                        </span>
                      )
                      : null}
                    {payment.source === "BUYER_SUBMITTED" && (
                      <ProofReviewBadge
                        reviewStatus={payment.reviewStatus}
                        t={t}
                      />
                    )}
                  </span>
                  <span className="text-[11px] font-medium text-[#8f7da8]">
                    {formatOrderDate(payment.createdAt, locale, t)}
                  </span>
                </div>
                {payment.note
                  ? (
                    <p className="mt-1 truncate text-xs text-[#6e5a87]">
                      {payment.note}
                    </p>
                  )
                  : null}
                {payment.source === "BUYER_SUBMITTED" &&
                  payment.reviewStatus === "PENDING_REVIEW" && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={reviewProof.isPending}
                      onClick={() =>
                        reviewProof.mutate({
                          orderId: payment.orderId,
                          paymentId: payment.id,
                          decision: "approve",
                        })}
                      className="store-theme-primary-button h-7 rounded-full px-3 text-xs font-semibold hover:opacity-100"
                    >
                      {t("approve")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={reviewProof.isPending}
                      onClick={() =>
                        reviewProof.mutate({
                          orderId: payment.orderId,
                          paymentId: payment.id,
                          decision: "reject",
                        })}
                      className="h-7 rounded-full px-3 text-xs font-semibold text-[#b24368] hover:bg-[#fff0f5]"
                    >
                      {t("reject")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
