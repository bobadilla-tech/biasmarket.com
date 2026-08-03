"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  type CartItem,
  cartTotal,
  getCart,
  hasMixedCurrencies,
  updateQuantity,
} from "@/lib/cart";

export default function CartPage() {
  const t = useTranslations("storefront.cartPage");
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(getCart(slug));
  }, [slug]);

  const handleQuantityChange = (item: CartItem, quantity: number) => {
    const next = updateQuantity(slug, item, quantity);
    setItems(next);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        {items.length === 0
          ? (
            <p className="text-gray-500">
              {t("empty")}{" "}
              <Link
                href={`/store/${slug}`}
                className="store-theme-link font-semibold"
              >
                {t("continueShopping")}
              </Link>
            </p>
          )
          : (
            <>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
                {items.map((item) => (
                  <div
                    key={`${item.productId}:${item.variantId ?? ""}`}
                    className="flex items-center justify-between gap-3 px-6 py-4"
                  >
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {item.name}
                      </p>
                      <p className="store-theme-active-text text-sm">
                        {item.price} {item.currency}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          handleQuantityChange(item, item.quantity - 1)}
                        className="size-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-sm text-gray-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          handleQuantityChange(item, item.quantity + 1)}
                        className="size-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  {t("total")}
                </span>
                <span className="store-theme-active-text font-bold text-lg">
                  {cartTotal(items).toFixed(2)} {items[0].currency}
                </span>
              </div>

              {hasMixedCurrencies(items)
                ? (
                  <p className="text-sm text-amber-600">
                    {t("mixedCurrencyWarning")}
                  </p>
                )
                : (
                  <Link
                    href={`/store/${slug}/checkout`}
                    className="store-theme-primary-button rounded-xl px-5 py-3 text-center text-sm font-semibold transition"
                  >
                    {t("goToCheckout")}
                  </Link>
                )}
            </>
          )}
      </div>
    </div>
  );
}
