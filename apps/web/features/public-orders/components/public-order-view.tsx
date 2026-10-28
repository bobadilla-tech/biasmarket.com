import { getTranslations } from "next-intl/server";
import type { Locale } from "next-intl";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { ContactSellerButton } from "@/features/customer-auth/components/contact-seller-button";
import { FulfillmentTimeline } from "@/features/orders/components/fulfillment-timeline";

function money(amount: string | number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Number(amount));
}

function detailLabel(key: string, labels: Record<string, string>) {
  return labels[key] ?? key;
}

export async function PublicOrderView({
  order,
  locale,
}: {
  order: PublicOrderResponseDto;
  locale: Locale;
}) {
  const t = await getTranslations({
    locale,
    namespace: "storefront.publicOrder",
  });
  const payable =
    order.status === "ACTIVE" && order.paymentStatus !== "CANCELLED";
  const paymentStatus = {
    PENDING_PAYMENT: t("paymentStatus.pending_payment"),
    PARTIALLY_PAID: t("paymentStatus.partially_paid"),
    PAYMENT_SUBMITTED: t("paymentStatus.payment_submitted"),
    VERIFIED: t("paymentStatus.verified"),
    REJECTED: t("paymentStatus.rejected"),
    CANCELLED: t("paymentStatus.cancelled"),
  }[order.paymentStatus];
  const orderStatus =
    order.status === "ACTIVE"
      ? t("orderStatus.active")
      : t("orderStatus.cancelled");
  const methodLabels = {
    YAPE: t("methods.yape"),
    PLIN: t("methods.plin"),
    TRANSFER: t("methods.transfer"),
    CASH: t("methods.cash"),
  };
  const paymentDetailLabels = {
    phoneNumber: t("details.phoneNumber"),
    accountHolder: t("details.accountHolder"),
    bankName: t("details.bankName"),
    accountNumber: t("details.accountNumber"),
    accountType: t("details.accountType"),
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh bg-gray-50 px-4 pb-10 pt-20 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <header className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            {order.store.logoUrl ? (
              <img
                src={order.store.logoUrl}
                alt=""
                className="size-12 rounded-xl object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-xl bg-gray-100 text-lg font-bold text-gray-600"
              >
                {order.store.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm text-gray-500">{t("storeLabel")}</p>
              <p className="truncate font-semibold text-gray-950">
                {order.store.name}
              </p>
            </div>
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
            {order.customerAlias
              ? t("greetingWithAlias", { alias: order.customerAlias })
              : t("greeting")}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm text-gray-600">{paymentStatus}</span>
            <span
              aria-hidden="true"
              className="size-1 rounded-full bg-gray-300"
            />
            <span className="text-sm text-gray-600">{orderStatus}</span>
          </div>
        </header>

        <section
          aria-labelledby="order-items-heading"
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <h2
            id="order-items-heading"
            className="text-lg font-semibold text-gray-950"
          >
            {t("itemsTitle")}
          </h2>
          <ul className="mt-4 divide-y divide-gray-100">
            {order.items.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {t("quantity", { quantity: item.quantity })}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium text-gray-800">
                  {money(
                    Number(item.unitPrice) * item.quantity,
                    item.currency,
                    locale,
                  )}
                </p>
              </li>
            ))}
          </ul>
          <dl className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">{t("total")}</dt>
              <dd className="font-semibold text-gray-950">
                {money(order.totalAmount, order.currency, locale)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">{t("paid")}</dt>
              <dd className="text-gray-800">
                {money(order.paidAmount, order.currency, locale)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium text-gray-800">{t("balance")}</dt>
              <dd className="font-semibold text-gray-950">
                {money(order.pendingAmount, order.currency, locale)}
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="fulfillment-heading"
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <h2
            id="fulfillment-heading"
            className="mb-4 text-lg font-semibold text-gray-950"
          >
            {t("progressTitle")}
          </h2>
          <FulfillmentTimeline fulfillmentStatus={order.fulfillmentStatus} />
        </section>

        <section
          aria-labelledby="phone-heading"
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <h2
            id="phone-heading"
            className="text-lg font-semibold text-gray-950"
          >
            {t("phoneTitle")}
          </h2>
          <p className="mt-2 text-gray-700">
            {t("phone", { phone: order.customerPhone })}
          </p>
          <div className="mt-4 flex flex-col items-start gap-2">
            <p className="text-sm text-gray-600">{t("wrongPhone")}</p>
            <ContactSellerButton slug={order.store.slug} />
          </div>
        </section>

        <section
          aria-labelledby="payment-heading"
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <h2
            id="payment-heading"
            className="text-lg font-semibold text-gray-950"
          >
            {t("paymentTitle")}
          </h2>
          {payable && order.paymentMethods.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-gray-600">
                {t("payAmount", {
                  amount: money(order.requiredAmount, order.currency, locale),
                })}
              </p>
              {order.paymentInstructions && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                  {order.paymentInstructions}
                </p>
              )}
              <ul className="mt-4 space-y-3">
                {order.paymentMethods.map((method) => (
                  <li key={method.method} className="rounded-xl bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-gray-900">
                        {methodLabels[method.method]}
                      </h3>
                      {method.depositPercent < 100 && (
                        <span className="text-sm text-gray-600">
                          {t("depositPercent", {
                            percentage: method.depositPercent,
                          })}
                        </span>
                      )}
                    </div>
                    <dl className="mt-2 space-y-1 text-sm">
                      {Object.entries(method.details)
                        .filter(
                          ([key, value]) =>
                            key !== "qrImageUrl" &&
                            typeof value === "string" &&
                            value.trim(),
                        )
                        .map(([key, value]) => (
                          <div key={key} className="flex flex-wrap gap-x-2">
                            <dt className="text-gray-500">
                              {detailLabel(key, paymentDetailLabels)}:
                            </dt>
                            <dd className="break-all font-medium text-gray-800">
                              {value as string}
                            </dd>
                          </div>
                        ))}
                    </dl>
                    {typeof method.details.qrImageUrl === "string" && (
                      <a
                        href={method.details.qrImageUrl}
                        className="mt-2 inline-block text-sm font-semibold text-blue-700 underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("viewQr")}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : payable ? (
            <p className="mt-2 text-sm text-gray-600">
              {t("noPaymentMethods")}
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-600">{t("notPayable")}</p>
          )}
        </section>
      </div>
    </main>
  );
}
