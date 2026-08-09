"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Receipt } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/shared/empty-state";
import {
  formatOrderDate,
  getOrderNumber,
  OrderStatusBadge,
  PaymentProofLightbox,
  RegisterPaymentForm,
  type RegisterPaymentInput,
} from "@/features/orders";
import { getShippingAddress, getDeliveryLabel } from "@/features/orders/lib/order-format";
import { paymentMethodLabels } from "@/features/orders/lib/payment-method-labels";
import { ContactSellerButton } from "./contact-seller-button";
import { orderPaymentsApi } from "../api/order-payments.api";
import { useSubmitPaymentProof } from "../mutations/use-submit-payment-proof";
import { usePublicPaymentMethods } from "../queries/use-public-payment-methods";
import type { OrderDetailResponseDto, OrderPaymentResponseDto } from "@biasmarket/types";

// Order-level states that no longer accept a new buyer-submitted proof —
// mirrors the exact guard `CustomerOrderPaymentsController.submit` enforces
// server-side (see apps/api's controller), so the form doesn't render only to
// 400 on submit.
const CLOSED_PAYMENT_STATUSES = new Set(["CANCELLED", "REJECTED", "VERIFIED"]);
const CLOSED_FULFILLMENT_STATUSES = new Set(["IN_TRANSIT", "READY", "COMPLETED"]);

function ProofReviewBadge(
  { reviewStatus, t }: {
    reviewStatus: OrderPaymentResponseDto["reviewStatus"];
    t: ReturnType<typeof useTranslations<"storefront.accountPage">>;
  },
) {
  if (reviewStatus === "PENDING_REVIEW") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
        {t("orderDetail.proofPending")}
      </span>
    );
  }
  if (reviewStatus === "APPROVED") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
        {t("orderDetail.proofApproved")}
      </span>
    );
  }
  if (reviewStatus === "REJECTED") {
    return (
      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
        {t("orderDetail.proofRejected")}
      </span>
    );
  }
  return null;
}

export function AccountOrderDetail(
  { slug, order }: { slug: string; order: OrderDetailResponseDto },
) {
  // Reuses `dashboard.orders`' formatting copy (delivery/date labels, payment
  // method names) — the same underlying concepts as the seller-facing sheet,
  // not seller-only actions, so sharing the translation namespace avoids
  // duplicating identical strings under `storefront.accountPage`.
  const t = useTranslations("dashboard.orders");
  const tAccount = useTranslations("storefront.accountPage");
  const { locale } = useParams<{ locale: string }>();
  const labels = paymentMethodLabels(t);
  const shippingAddress = getShippingAddress(order);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const submitProof = useSubmitPaymentProof(slug, order.id);
  const enabledMethods = usePublicPaymentMethods(slug);

  const canSubmitProof = order.pendingAmount > 0 &&
    !CLOSED_PAYMENT_STATUSES.has(order.paymentStatus) &&
    !CLOSED_FULFILLMENT_STATUSES.has(order.fulfillmentStatus);

  const submittedProofs = order.payments.filter(
    (payment) => payment.source === "BUYER_SUBMITTED" && payment.imageUrl,
  );

  async function handleSubmitProof(values: RegisterPaymentInput) {
    await submitProof.mutateAsync(values);
    toast.success(tAccount("orderDetail.submitProofSuccess"));
  }

  return (
    <div className="flex flex-col gap-6">
      <PaymentProofLightbox url={previewUrl} onClose={() => setPreviewUrl(null)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/store/${slug}/account`}
          className="store-theme-link flex items-center gap-1.5 text-sm font-semibold"
        >
          <ArrowLeft className="size-4" />
          {tAccount("backToOrders")}
        </Link>
        <ContactSellerButton slug={slug} orderId={order.id} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">
          {t("details.title", { number: getOrderNumber(order.id) })}
        </h1>
        <OrderStatusBadge order={order} />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{t("details.total")}</span>
          <span className="font-semibold text-gray-900">
            {order.currency} {order.totalAmount}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{t("details.paid")}</span>
          <span className="font-semibold text-emerald-600">
            {order.currency} {order.paidAmount.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{t("details.pending")}</span>
          <span className="font-semibold text-rose-600">
            {order.currency} {order.pendingAmount.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
          <span className="text-gray-500">{t("details.delivery")}</span>
          <span className="font-semibold text-gray-900">
            {getDeliveryLabel(order, t)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{t("details.date")}</span>
          <span className="font-semibold text-gray-900">
            {formatOrderDate(order.createdAt, locale, t)}
          </span>
        </div>
        {shippingAddress && (
          <div className="flex flex-col gap-1 border-t border-gray-100 pt-3 text-sm">
            <span className="text-gray-500">{t("details.shippingAddress")}</span>
            <p className="font-semibold text-gray-900">
              {shippingAddress.recipientName} · {shippingAddress.phone}
            </p>
            <p className="text-gray-900">
              {shippingAddress.line1}
              {shippingAddress.line2 ? `, ${shippingAddress.line2}` : ""}
            </p>
            <p className="text-gray-900">
              {shippingAddress.city}
              {shippingAddress.region ? `, ${shippingAddress.region}` : ""}
            </p>
            {shippingAddress.reference && (
              <p className="text-gray-500">{shippingAddress.reference}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">
          {t("details.items")}
        </h2>
        <div className="flex flex-col gap-2">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">
                  {item.product.name}
                  {item.variant?.name ? ` (${item.variant.name})` : ""}
                </p>
                <p className="text-xs text-gray-500">
                  {t("details.quantity", { count: item.quantity })}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-gray-900">
                {item.currency} {item.unitPriceAtPurchase}
              </span>
            </div>
          ))}
        </div>
      </div>

      {canSubmitProof && (
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {tAccount("orderDetail.submitProofTitle")}
            </h2>
            <p className="text-xs text-gray-500">
              {tAccount("orderDetail.submitProofHint")}
            </p>
          </div>
          <RegisterPaymentForm
            pendingAmount={order.pendingAmount}
            enabledMethods={(enabledMethods.data ?? []).map((m) => m.method)}
            submitting={submitProof.isPending}
            onSubmit={handleSubmitProof}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">
          {t("details.paymentHistory")}
        </h2>
        {order.payments.length === 0
          ? (
            <p className="text-sm text-gray-500">
              {tAccount("orderDetail.noPayments")}
            </p>
          )
          : (
            <div className="flex flex-col gap-2">
              {order.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-gray-900">
                      {order.currency} {payment.amount}
                      {payment.method
                        ? (
                          <span className="font-medium text-gray-500">
                            · {labels[payment.method] ?? payment.method}
                          </span>
                        )
                        : null}
                      {payment.source === "BUYER_SUBMITTED" && (
                        <ProofReviewBadge
                          reviewStatus={payment.reviewStatus}
                          t={tAccount}
                        />
                      )}
                    </p>
                    {payment.note
                      ? <p className="text-xs text-gray-500">{payment.note}</p>
                      : null}
                  </div>
                  <span className="shrink-0 text-xs font-medium text-gray-500">
                    {formatOrderDate(payment.createdAt, locale, t)}
                  </span>
                </div>
              ))}
            </div>
          )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">
          {tAccount("orderDetail.screenshots")}
        </h2>
        {submittedProofs.length === 0
          ? (
            <EmptyState
              icon={Receipt}
              message={tAccount("orderDetail.screenshotsEmpty")}
            />
          )
          : (
            <div className="flex flex-wrap gap-3">
              {submittedProofs.map((payment) => (
                <button
                  key={payment.id}
                  type="button"
                  onClick={() =>
                    setPreviewUrl(
                      orderPaymentsApi.paymentImageUrl(
                        slug,
                        order.id,
                        payment.id,
                      ),
                    )}
                  className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50"
                >
                  <img
                    src={orderPaymentsApi.paymentImageUrl(
                      slug,
                      order.id,
                      payment.id,
                    )}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
