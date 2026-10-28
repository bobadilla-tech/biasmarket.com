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

  // The buyer still owes `pendingAmount`, not `requiredAmount`: recorded or
  // approved payments already reduced it, and a rejected proof on a
  // partially-paid order leaves the status at REJECTED, not PARTIALLY_PAID.
  // The wording keeps the order's shape (deposit plan vs. full total), but
  // every amount shown is what still needs to be paid.
  const due = money(order.pendingAmount);
  let amountLine: string;
  if (order.paymentStatus === "PARTIALLY_PAID") {
    amountLine = t("howToPay.amountDue", { amount: due });
  } else if (Number(order.requiredAmount) < Number(order.totalAmount)) {
    amountLine = t("howToPay.amountDeposit", {
      deposit: due,
      total: money(order.totalAmount),
    });
  } else {
    amountLine = t("howToPay.amountTotal", { total: due });
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
