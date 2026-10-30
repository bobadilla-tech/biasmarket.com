"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { Sparkles } from "lucide-react";
import { StoreLogo } from "@/components/store-logo";
import { ContactSellerButton } from "@/features/customer-auth/components/contact-seller-button";
import { FulfillmentTimeline } from "@/features/orders/components/fulfillment-timeline";
import { formatOrderDate } from "@/features/orders/lib/order-format";
import {
  getBannerKey,
  isCancelled,
  isClosedOrder,
  shouldShowHowToPay,
} from "../lib/order-state";
import { paymentProofSrc } from "../lib/shipping-links";
import { ProofUploadSection } from "./proof-upload-section";
import { HowToPay } from "./how-to-pay";
import { ClaimOrderButton } from "./claim-order-button";
import { ReceiptConfirmation } from "./receipt-confirmation";
import { SaveOrderInvite } from "./save-order-invite";
import { ShippingDetails } from "./shipping-details";
import { Timeline } from "./timeline";
import { formatLimaDateTime } from "../lib/format-lima-datetime";
import { useSaveInvite } from "../hooks/use-save-invite";

const BANNER_TONE: Record<ReturnType<typeof getBannerKey>, string> = {
  cancelled: "border-gray-200 bg-gray-50 text-gray-700",
  expired: "border-gray-200 bg-gray-50 text-gray-700",
  inTransit: "border-sky-200 bg-sky-50 text-sky-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  pendingPayment: "border-amber-200 bg-amber-50 text-amber-800",
  partiallyPaid: "border-amber-200 bg-amber-50 text-amber-800",
  paymentSubmitted: "border-sky-200 bg-sky-50 text-sky-800",
  verified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

export function PublicOrderView({
  slug,
  token,
  order,
}: {
  slug: string;
  token: string;
  order: PublicOrderResponseDto;
}) {
  const t = useTranslations("storefront.publicOrder");
  const tMethods = useTranslations("storefront.checkoutPage");
  const locale = useLocale();
  const [receiptJustConfirmed, setReceiptJustConfirmed] = useState(false);
  const invite = useSaveInvite({ slug, token, order, receiptJustConfirmed });
  const money = (amount: string | number) => `${order.currency} ${amount}`;
  const cancelled = isCancelled(order);
  const bannerKey = getBannerKey(order);
  const closed = isClosedOrder(order);
  const showClosure = cancelled || order.paymentStatus === "REJECTED";
  const closureReason = cancelled
    ? (order.closure?.reason ?? null)
    : (order.paymentRejectionReason ?? null);
  const hasVoided = order.payments.some((payment) => payment.voidedAt);
  const isMilestone = ["verified", "ready", "completed"].includes(bannerKey);
  // Defensive: an API that predates these fields simply omits them.
  const orderNumber = order.orderNumber ? order.orderNumber : null;
  const depositDiffers =
    Number(order.requiredAmount) < Number(order.totalAmount);
  const address = order.deliveryDetails;
  const addressLines = [
    address.line1,
    address.district,
    address.city,
    address.reference,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <StoreLogo
          name={order.store.name}
          logoUrl={order.store.logoUrl}
          size={48}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {order.store.name}
          </p>
          {orderNumber && (
            <p className="text-xs text-gray-500">
              {t("orderNumber", { number: orderNumber })}
              {order.createdAt
                ? ` · ${formatOrderDate(order.createdAt, locale, t)}`
                : ""}
            </p>
          )}
        </div>
      </header>

      <h1 className="text-xl font-bold text-gray-900">
        {order.customerAlias
          ? t("greeting", { name: order.customerAlias })
          : t("greetingGeneric")}
      </h1>

      <p
        role="note"
        className="break-words rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-5 text-gray-700"
      >
        {t("phonePrivacyNotice")}
      </p>

      <div
        role="status"
        className={`purchase-milestone flex items-center gap-2.5 rounded-2xl border p-4 text-sm font-semibold ${
          BANNER_TONE[bannerKey]
        }`}
      >
        {isMilestone && (
          <Sparkles
            aria-hidden="true"
            className="fan-sparkle size-5 shrink-0 text-amber-500"
          />
        )}
        <span>{t(`banner.${bannerKey}`)}</span>
      </div>

      {order.expiresAt && !closed && (
        <p className="-mt-2 text-xs text-gray-600">
          {t("deadline", { date: formatLimaDateTime(order.expiresAt, locale) })}
        </p>
      )}

      {showClosure && (
        <section
          aria-labelledby="public-order-closure"
          className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-5 text-sm shadow-sm"
        >
          <h2
            id="public-order-closure"
            className="text-sm font-semibold text-gray-900"
          >
            {t("closure.title")}
          </h2>
          {/* Seller-written text: rendered as React text, never as HTML. */}
          {closureReason && (
            <p className="whitespace-pre-wrap break-words text-gray-700">
              {t("closure.reason", { reason: closureReason })}
            </p>
          )}
          <p className="text-gray-600">
            {cancelled
              ? t(
                  order.closure?.kind === "EXPIRED"
                    ? "closure.expiredNote"
                    : "closure.cancelledNote",
                )
              : t("closure.rejectedNote")}
          </p>
          <ContactSellerButton
            slug={slug}
            message={t("closure.message", { number: orderNumber ?? "" })}
            label={t("closure.contact")}
          />
        </section>
      )}

      {/* Above everything that can grow (invite blocks later), so it stays
          on the first screen on a phone. */}
      <ReceiptConfirmation
        slug={slug}
        token={token}
        order={order}
        onConfirmed={() => setReceiptJustConfirmed(true)}
      />

      {invite.moment && invite.moment !== "adelanto_linea_de_tiempo" && (
        <SaveOrderInvite
          token={token}
          moment={invite.moment}
          onClick={invite.clicked}
          onDismiss={invite.dismiss}
        />
      )}

      {!cancelled && (
        <section
          aria-labelledby="public-order-progress"
          className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
        >
          <h2
            id="public-order-progress"
            className="mb-3 text-sm font-semibold text-gray-900"
          >
            {t("progress")}
          </h2>
          <FulfillmentTimeline fulfillmentStatus={order.fulfillmentStatus} />
        </section>
      )}

      <ShippingDetails token={token} order={order} />

      <section
        aria-labelledby="public-order-history"
        className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <h2
          id="public-order-history"
          className="text-sm font-semibold text-gray-900"
        >
          {t("timeline.title")}
        </h2>
        {/* Read as optional: an API that predates these fields omits them. */}
        {order.claimed ? (
          <>
            <p role="status" className="text-sm font-semibold text-emerald-700">
              {t("claim.saved")}
            </p>
            <Timeline items={order.timeline ?? []} currency={order.currency} />
          </>
        ) : (
          <>
            {order.lastUpdateAt && (
              <p className="text-sm text-gray-700">
                {t("timeline.lastUpdate", {
                  date: formatLimaDateTime(order.lastUpdateAt, locale),
                })}
              </p>
            )}
            {invite.moment === "adelanto_linea_de_tiempo" && (
              <>
                <p className="text-sm text-gray-700">{t("timeline.teaser")}</p>
                <ClaimOrderButton
                  token={token}
                  moment="adelanto_linea_de_tiempo"
                  onStart={invite.clicked}
                />
              </>
            )}
          </>
        )}
      </section>

      <section
        aria-labelledby="public-order-items"
        className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <h2
          id="public-order-items"
          className="text-sm font-semibold text-gray-900"
        >
          {t("items")}
        </h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-gray-700">
                {item.quantity} × {item.name}
              </span>
              <span className="shrink-0 text-gray-900">
                {item.currency} {item.unitPrice}
              </span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-2 border-t border-gray-100 pt-3">
          <Row label={t("total")} value={money(order.totalAmount)} />
          {depositDiffers && (
            <Row label={t("deposit")} value={money(order.requiredAmount)} />
          )}
          <Row label={t("paid")} value={money(order.paidAmount)} />
          <Row
            label={depositDiffers ? t("pendingDeposit") : t("pending")}
            value={money(order.pendingAmount)}
          />
        </dl>
      </section>

      {order.payments.length > 0 && (
        <section
          aria-labelledby="public-order-payments"
          className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
        >
          <h2
            id="public-order-payments"
            className="text-sm font-semibold text-gray-900"
          >
            {t("payments.title")}
          </h2>
          <ul className="flex flex-col gap-3">
            {order.payments.map((payment) => {
              // `voidedAt` first: a voided payment has no review label.
              const status = payment.voidedAt
                ? t("payments.voided")
                : payment.reviewStatus === "PENDING_REVIEW"
                  ? closed
                    ? t("payments.closedPending")
                    : t("payments.pendingReview")
                  : payment.reviewStatus === "REJECTED"
                    ? t("payments.rejected")
                    : t("payments.recorded");
              return (
                <li key={payment.id} className="flex flex-col gap-0.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span
                      className={
                        payment.voidedAt
                          ? "text-gray-400 line-through"
                          : "font-semibold text-gray-900"
                      }
                    >
                      {money(payment.amount)}
                    </span>
                    <span className="text-gray-600">{status}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {payment.source === "BUYER_SUBMITTED"
                      ? t("payments.bySelf")
                      : t("payments.byStore")}
                    {payment.method
                      ? ` · ${tMethods(
                          `paymentMethodLabels.${payment.method}`,
                        )}`
                      : ""}
                    {" · "}
                    {formatOrderDate(
                      payment.paidAt ?? payment.createdAt,
                      locale,
                      t,
                    )}
                  </p>
                  {payment.hasProof && (
                    <a
                      href={paymentProofSrc(token, payment.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-2 text-xs font-semibold text-gray-700 underline"
                    >
                      <img
                        src={paymentProofSrc(token, payment.id)}
                        alt={t("payments.proofAlt")}
                        loading="lazy"
                        className="size-12 rounded-lg object-cover"
                      />
                      {t("payments.viewProof")}
                    </a>
                  )}
                  {payment.reviewStatus === "REJECTED" && !payment.voidedAt && (
                    <p className="text-xs text-rose-600">
                      {t("payments.rejectedNote")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {hasVoided && (
            <p className="text-xs text-gray-500">
              {t("payments.balanceUpdated")}
            </p>
          )}
        </section>
      )}

      {shouldShowHowToPay(order) && <HowToPay slug={slug} order={order} />}
      <ProofUploadSection slug={slug} token={token} order={order} />

      <section
        aria-labelledby="public-order-delivery"
        className="flex flex-col gap-1 rounded-2xl border border-gray-100 bg-white p-5 text-sm shadow-sm"
      >
        <h2
          id="public-order-delivery"
          className="mb-1 text-sm font-semibold text-gray-900"
        >
          {t("delivery.title")}
        </h2>
        {order.deliveryMethodType === "PICKUP" ? (
          <>
            <p className="text-gray-700">{t("delivery.pickup")}</p>
            {address.pickupPointLabel && (
              <p className="text-gray-600">{address.pickupPointLabel}</p>
            )}
            {order.pickupDate && (
              <p className="text-gray-600">
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  // Stored as UTC midnight: the browser zone would show the
                  // previous day west of UTC.
                  timeZone: "UTC",
                }).format(new Date(order.pickupDate))}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-gray-700">
              {order.courierName
                ? t("delivery.courierNamed", { name: order.courierName })
                : t("delivery.courier")}
            </p>
            {addressLines && <p className="text-gray-600">{addressLines}</p>}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-5 text-sm shadow-sm">
        <p className="text-gray-700">
          {t("phoneLine", { phone: order.customerPhone })}
        </p>
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">
            {t("notYourNumber.summary")}
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-gray-600">{t("notYourNumber.body")}</p>
            <ContactSellerButton
              slug={slug}
              message={t("notYourNumber.message", {
                number: orderNumber ?? "",
              })}
              label={t("notYourNumber.button")}
            />
          </div>
        </details>
      </section>
    </div>
  );
}
