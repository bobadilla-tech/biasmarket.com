"use client";

import { useTranslations } from "next-intl";
import { type CartItem, cartTotal } from "@/lib/cart";

interface CheckoutSummaryProps {
  items: CartItem[];
}

export function CheckoutSummary({ items }: CheckoutSummaryProps) {
  const t = useTranslations("storefront.checkoutPage");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-1">
      {items.map((item) => (
        <div
          key={`${item.productId}:${item.variantId ?? ""}`}
          className="flex justify-between text-sm text-gray-600"
        >
          <span>
            {item.quantity}x {item.name}
          </span>
          <span>
            {(item.price * item.quantity).toFixed(2)} {item.currency}
          </span>
        </div>
      ))}
      <div className="flex justify-between pt-2 mt-2 border-t border-gray-100 font-semibold text-gray-900">
        <span>{t("total")}</span>
        <span>
          {cartTotal(items).toFixed(2)} {items[0].currency}
        </span>
      </div>
    </div>
  );
}
