"use client";

import { useTranslations } from "next-intl";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { ContactSellerButton } from "@/features/customer-auth/components/contact-seller-button";
import { PaymentMethodDetails } from "@/features/checkout/components/payment-method-details";

export function HowToPay({
  slug,
  order,
}: {
  slug: string;
  order: PublicOrderResponseDto;
}) {
  const t = useTranslations("storefront.publicOrder");
  const tMethods = useTranslations("storefront.checkoutPage");
  const instructions = order.paymentInstructions?.trim();
  const hasMethods = order.paymentMethods.length > 0;
  const money = (amount: string | number) => `${order.currency} ${amount}`;

  // Amounts come from the order, never from a method's `depositPercent` (that
  // is the store's per-method config, not this order's adelanto).
  let amountLine: string;
  if (order.paymentStatus === "PARTIALLY_PAID") {
    amountLine = t("howToPay.amountDue", {
      amount: money(order.pendingAmount),
    });
  } else if (Number(order.requiredAmount) < Number(order.totalAmount)) {
    amountLine = t("howToPay.amountDeposit", {
      deposit: money(order.requiredAmount),
      total: money(order.totalAmount),
    });
  } else {
    amountLine = t("howToPay.amountTotal", { total: money(order.totalAmount) });
  }

  return (
    <section
      aria-labelledby="public-order-how-to-pay"
      className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
    >
      <h2
        id="public-order-how-to-pay"
        className="text-sm font-semibold text-gray-900"
      >
        {t("howToPay.title")}
      </h2>
      <p className="text-sm font-medium text-gray-900">{amountLine}</p>

      {order.paymentStatus === "REJECTED" && (
        <p className="text-sm text-rose-600">{t("howToPay.rejectedNote")}</p>
      )}

      {instructions && (
        <p className="whitespace-pre-wrap text-sm text-gray-600">
          {instructions}
        </p>
      )}

      {hasMethods ? (
        <div className="flex flex-col gap-3">
          {order.paymentMethods.map((method) => (
            <div key={method.method} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {tMethods(`paymentMethodLabels.${method.method}`)}
              </h3>
              <PaymentMethodDetails method={method} />
            </div>
          ))}
        </div>
      ) : (
        !instructions && (
          <p className="text-sm text-gray-600">{t("howToPay.noMethods")}</p>
        )
      )}

      <ContactSellerButton
        slug={slug}
        message={t("howToPay.paidMessage", { number: order.orderNumber ?? "" })}
        label={t("howToPay.paidButton")}
      />
    </section>
  );
}
