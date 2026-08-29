"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  type CartItem,
  cartTotal,
  getCart,
  hasMixedCurrencies,
  removeItem,
  updateQuantity,
} from "@/lib/cart";
import { useCartStock } from "@/features/cart";

function displayName(item: CartItem) {
  return item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name;
}

function CartSummary({
  slug,
  items,
  shipping,
  discount,
}: {
  slug: string;
  items: CartItem[];
  shipping?: number;
  discount?: number;
}) {
  const t = useTranslations("storefront.cartPage");
  const mixedCurrencies = hasMixedCurrencies(items);
  const currency = items[0].currency;
  const subtotal = cartTotal(items);
  const total = subtotal + (shipping ?? 0) - (discount ?? 0);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-stone-900">{t("summary")}</h2>

      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <div
            key={`${item.productId}:${item.variantId ?? ""}`}
            className="flex justify-between gap-4 text-sm text-stone-600"
          >
            <span className="min-w-0 flex-1">
              {item.quantity}x {displayName(item)}
            </span>
            <span className="shrink-0">
              {(item.price * item.quantity).toFixed(2)} {item.currency}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-1 flex flex-col gap-2 border-t border-stone-200 pt-3">
        <div className="flex justify-between text-sm text-stone-600">
          <span>{t("subtotal")}</span>
          <span>
            {subtotal.toFixed(2)} {currency}
          </span>
        </div>
        {shipping !== undefined && (
          <div className="flex justify-between text-sm text-stone-600">
            <span>{t("shipping")}</span>
            <span>
              {shipping.toFixed(2)} {currency}
            </span>
          </div>
        )}
        {discount !== undefined && (
          <div className="flex justify-between text-sm text-stone-600">
            <span>{t("discount")}</span>
            <span>
              -{discount.toFixed(2)} {currency}
            </span>
          </div>
        )}
      </div>

      <div className="mt-1 flex items-baseline justify-between border-t border-stone-200 pt-4">
        <span className="text-sm font-semibold text-stone-900">
          {t("total")}
        </span>
        <span className="text-xl font-bold text-stone-900">
          {total.toFixed(2)} {currency}
        </span>
      </div>

      {mixedCurrencies ? (
        <p className="text-sm text-amber-600">{t("mixedCurrencyWarning")}</p>
      ) : (
        <Link
          href={`/store/${slug}/checkout`}
          className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
        >
          {t("continueToCheckout")}
          <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

export function CartPageClient() {
  const t = useTranslations("storefront.cartPage");
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<CartItem[]>([]);
  const { variantAvail, productAvail } = useCartStock(slug);

  useEffect(() => {
    setItems(getCart(slug));
  }, [slug]);

  const availableFor = (item: CartItem) =>
    item.variantId
      ? variantAvail.get(item.variantId)
      : productAvail.get(item.productId);

  const handleQuantityChange = (item: CartItem, quantity: number) => {
    setItems(updateQuantity(slug, item, quantity));
  };

  const handleRemove = (item: CartItem) => {
    setItems(removeItem(slug, item));
  };

  if (items.length === 0) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-dvh bg-stone-50 px-6 py-10"
      >
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold text-stone-900">{t("title")}</h1>
          <p className="mt-4 text-stone-500">
            {t("empty")}{" "}
            <Link
              href={`/store/${slug}`}
              className="font-semibold text-stone-900 underline underline-offset-2 hover:text-black"
            >
              {t("continueShopping")}
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh bg-stone-50 px-6 py-10"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <Link
            href={`/store/${slug}`}
            className="text-sm text-stone-500 hover:underline"
          >
            ← {t("continueShopping")}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-stone-900">
            {t("title")}
          </h1>
        </div>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="bg-white divide-y divide-stone-100 rounded-2xl border border-stone-200 shadow-sm">
            {items.map((item) => (
              <div
                key={`${item.productId}:${item.variantId ?? ""}`}
                className="flex gap-4 px-4 py-5 sm:px-6"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                    />
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {item.name}
                  </p>
                  {item.variantLabel && (
                    <span className="w-fit rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                      {item.variantLabel}
                    </span>
                  )}
                  <p className="text-sm text-stone-500">
                    {item.price.toFixed(2)} {item.currency}
                  </p>
                </div>

                <div className="flex flex-col items-end justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    aria-label={t("remove")}
                    className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 rounded-lg border border-stone-200 p-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleQuantityChange(item, item.quantity - 1)
                        }
                        className="size-7 rounded-md text-stone-600 transition hover:bg-stone-100"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-sm text-stone-900">
                        {item.quantity}
                      </span>
                      {(() => {
                        const available = availableFor(item);
                        const atCap =
                          available !== undefined &&
                          available !== Infinity &&
                          item.quantity >= available;
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              handleQuantityChange(item, item.quantity + 1)
                            }
                            disabled={atCap}
                            aria-disabled={atCap}
                            className="size-7 rounded-md text-stone-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            +
                          </button>
                        );
                      })()}
                    </div>
                    <span className="w-16 text-right text-sm font-semibold text-stone-900">
                      {(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <CartSummary slug={slug} items={items} />
        </div>
      </div>
    </main>
  );
}
