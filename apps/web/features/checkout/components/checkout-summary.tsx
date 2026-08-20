"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { type CartItem, cartTotal } from "@/lib/cart";

interface CheckoutSummaryProps {
  items: CartItem[];
  paymentType?: "FULL" | "PARTIAL";
  depositPercent?: number;
}

export function CheckoutSummary({
  items,
  paymentType = "FULL",
  depositPercent = 100,
}: CheckoutSummaryProps) {
  const t = useTranslations("storefront.checkoutPage");

  const total = cartTotal(items);
  const isPartial = paymentType === "PARTIAL" && depositPercent < 100;
  const payNow = isPartial ? total * (depositPercent / 100) : total;
  const pending = isPartial ? total - payNow : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
      {items.map((item) => (
        <div
          key={`${item.productId}:${item.variantId ?? ""}`}
          className="flex items-center gap-3"
        >
          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
            {item.image ? (
              <Image
                src={item.image}
                alt={item.name}
                fill
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 justify-between gap-2 text-sm text-gray-600">
            <span className="truncate">
              {item.quantity}x{" "}
              {item.variantLabel
                ? `${item.name} (${item.variantLabel})`
                : item.name}
            </span>
            <span className="shrink-0">
              {(item.price * item.quantity).toFixed(2)} {item.currency}
            </span>
          </div>
        </div>
      ))}

      {isPartial && (
        <>
          <div className="flex justify-between pt-2 mt-1 border-t border-gray-100 text-sm text-gray-600">
            <span>{t("paymentSummaryTotal")}</span>
            <span>
              {total.toFixed(2)} {items[0].currency}
            </span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900">
            <span>{t("paymentSummaryPayNow")}</span>
            <span className="text-green-600">
              {payNow.toFixed(2)} {items[0].currency}
            </span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>{t("paymentSummaryPending")}</span>
            <span>
              {pending.toFixed(2)} {items[0].currency}
            </span>
          </div>
        </>
      )}

      {!isPartial && (
        <div className="flex justify-between pt-2 mt-1 border-t border-gray-100 font-semibold text-gray-900">
          <span>{t("total")}</span>
          <span>
            {total.toFixed(2)} {items[0].currency}
          </span>
        </div>
      )}
    </div>
  );
}
