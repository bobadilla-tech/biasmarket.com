"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { type CartItem, cartTotal } from "@/lib/cart";

interface CheckoutSummaryProps {
  items: CartItem[];
}

export function CheckoutSummary({ items }: CheckoutSummaryProps) {
  const t = useTranslations("storefront.checkoutPage");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
      {items.map((item) => (
        <div
          key={`${item.productId}:${item.variantId ?? ""}`}
          className="flex items-center gap-3"
        >
          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
            {item.image
              ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  className="object-cover"
                />
              )
              : null}
          </div>
          <div className="flex min-w-0 flex-1 justify-between gap-2 text-sm text-gray-600">
            <span className="truncate">
              {item.quantity}x {item.variantLabel
                ? `${item.name} (${item.variantLabel})`
                : item.name}
            </span>
            <span className="shrink-0">
              {(item.price * item.quantity).toFixed(2)} {item.currency}
            </span>
          </div>
        </div>
      ))}
      <div className="flex justify-between pt-2 mt-1 border-t border-gray-100 font-semibold text-gray-900">
        <span>{t("total")}</span>
        <span>
          {cartTotal(items).toFixed(2)} {items[0].currency}
        </span>
      </div>
    </div>
  );
}
