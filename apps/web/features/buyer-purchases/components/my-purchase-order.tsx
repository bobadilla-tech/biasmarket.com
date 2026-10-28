"use client";

import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { OrderStatusBadge } from "@/features/orders";
import { Timeline } from "@/features/public-order/components/timeline";
import { formatLimaDateTime } from "@/features/public-order/lib/format-lima-datetime";
import { safeTrackingUrl } from "@/features/public-order/lib/shipping-links";
import { useGlobalOrder } from "../queries/use-global-account";
import { OriginLabel } from "./origin-label";

// Mi cuenta -> one order. A client component on purpose (see useGlobalOrder).
// Shows what the store recorded, where each payment came from, voided
// payments, tracking and the dated steps.
export function MyPurchaseOrder({
  orderId,
  justClaimed,
}: {
  orderId: string;
  justClaimed: boolean;
}) {
  const t = useTranslations("storefront.myPurchases");
  const tp = useTranslations("storefront.publicOrder");
  const locale = useLocale();
  const order = useGlobalOrder(orderId);

  if (order.isPending) return <LoadingState />;

  if (order.isError) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorState message={t("detail.notFound")} />
        <Link
          href="/my-purchases"
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          {t("detail.back")}
        </Link>
      </div>
    );
  }

  const data = order.data;
  const money = (amount: string | number) => `${data.currency} ${amount}`;
  const trackingUrl = safeTrackingUrl(data.trackingUrl);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/my-purchases"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("detail.back")}
      </Link>

      {justClaimed && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"
        >
          {t("detail.claimed")}
        </div>
      )}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {data.storeName} · #{data.id.slice(0, 8)}
          </h1>
          <OriginLabel source={data.source} />
        </div>
        <p className="text-xs text-gray-500">
          {formatLimaDateTime(data.createdAt, locale)}
        </p>
        <div>
          <OrderStatusBadge order={data} />
        </div>
      </header>

      <section
        aria-labelledby="my-order-items"
        className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <h2 id="my-order-items" className="text-sm font-semibold text-gray-900">
          {tp("items")}
        </h2>
        <ul className="flex flex-col gap-2">
          {data.items.map((item, index) => (
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
        <dl className="flex flex-col gap-1 border-t border-gray-100 pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">{tp("total")}</dt>
            <dd className="font-semibold text-gray-900">
              {money(data.totalAmount)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">{tp("paid")}</dt>
            <dd className="font-semibold text-gray-900">
              {money(data.paidAmount)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">{tp("pending")}</dt>
            <dd className="font-semibold text-gray-900">
              {money(data.pendingAmount)}
            </dd>
          </div>
        </dl>
      </section>

      {data.payments.length > 0 && (
        <section
          aria-labelledby="my-order-payments"
          className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
        >
          <h2
            id="my-order-payments"
            className="text-sm font-semibold text-gray-900"
          >
            {tp("payments.title")}
          </h2>
          <ul className="flex flex-col gap-3">
            {data.payments.map((payment, index) => {
              const status = payment.voidedAt
                ? tp("payments.voided")
                : payment.reviewStatus === "PENDING_REVIEW"
                  ? tp("payments.pendingReview")
                  : payment.reviewStatus === "REJECTED"
                    ? tp("payments.rejected")
                    : tp("payments.recorded");
              return (
                <li key={index} className="flex flex-col gap-0.5 text-sm">
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
                      ? tp("payments.bySelf")
                      : tp("payments.byStore")}
                    {" · "}
                    {formatLimaDateTime(payment.createdAt, locale)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(data.trackingNumber || trackingUrl) && (
        <section className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-5 text-sm shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            {tp("shipping.title")}
          </h2>
          {data.trackingNumber && (
            <p className="break-words text-gray-700">
              {tp("shipping.trackingNumber", { number: data.trackingNumber })}
            </p>
          )}
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-semibold text-gray-900 underline"
            >
              {tp("shipping.trackLink")}
            </a>
          )}
        </section>
      )}

      <section
        aria-labelledby="my-order-history"
        className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <h2
          id="my-order-history"
          className="text-sm font-semibold text-gray-900"
        >
          {tp("timeline.title")}
        </h2>
        <Timeline items={data.timeline} currency={data.currency} />
      </section>
    </div>
  );
}
