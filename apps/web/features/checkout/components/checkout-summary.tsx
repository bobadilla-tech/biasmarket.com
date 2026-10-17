"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight, Minus, Plus, ShoppingCart } from "lucide-react";
import { type CartItem, cartTotal } from "@/lib/cart";

interface CheckoutSummaryProps {
  items: CartItem[];
  paymentType?: "FULL" | "PARTIAL";
  depositPercent?: number;
  // Server-equivalent delivery cost of the selected method — CreateOrderUseCase
  // adds it to the item total before applying the deposit percentage, so the
  // displayed pay-now/pending must include it too.
  deliveryCost?: number;
  canSubmit?: boolean;
  isSubmitting?: boolean;
  onQuantityChange?: (item: CartItem, quantity: number) => void;
}

export function CheckoutSummary({
  items,
  paymentType = "FULL",
  depositPercent = 100,
  deliveryCost = 0,
  canSubmit = false,
  isSubmitting = false,
  onQuantityChange,
}: CheckoutSummaryProps) {
  const t = useTranslations("storefront.checkoutPage");

  const total = cartTotal(items) + deliveryCost;
  const subtotal = cartTotal(items);
  const isPartial = paymentType === "PARTIAL" && depositPercent < 100;
  // Mirror the server's operator order + rounding
  // (create-order.usecase.ts: finalAmount.times(pct).div(100), then a
  // 2-decimal round) so this pre-submit estimate lines up with the
  // authoritative requiredAmount. `cartTotal` is still float summation over
  // client-cached prices, so a post-add price change can still move this by a
  // cent — the confirmation screen shows the real requiredAmount.
  const payNow = isPartial
    ? Number(((total * depositPercent) / 100).toFixed(2))
    : total;
  const pending = isPartial ? total - payNow : 0;
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);

  return (
    <div
      data-store-card
      className="flex max-h-[calc(100dvh-3rem)] flex-col gap-4 overflow-y-auto rounded-[1.5rem] border border-(--store-border) bg-(--store-card) p-5 shadow-[var(--shadow-soft)] sm:p-6"
    >
      <header className="flex items-center justify-between gap-3 border-b border-(--store-border) pb-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <ShoppingCart aria-hidden="true" className="size-5" />
          </span>
          <h2 className="text-base font-bold text-gray-900">
            {t("summaryTitle")}
          </h2>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
          {t("itemCount", { count: itemCount })}
        </span>
      </header>
      {items.map((item) => (
        <div
          key={`${item.productId}:${item.variantId ?? ""}`}
          className="flex items-center gap-3"
        >
          <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-(--store-surface) ring-1 ring-(--store-border)">
            {item.image ? (
              <Image
                src={item.image}
                alt={item.name}
                fill
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-w-0 justify-between gap-2 text-sm text-gray-600">
              <span className="truncate">
                {item.variantLabel
                  ? `${item.name} (${item.variantLabel})`
                  : item.name}
              </span>
              <span className="shrink-0 font-semibold text-gray-900">
                {(item.price * item.quantity).toFixed(2)} {item.currency}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t("decreaseQuantity", { product: item.name })}
                onClick={() => onQuantityChange?.(item, item.quantity - 1)}
                className="grid size-9 place-items-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
              >
                <Minus aria-hidden="true" className="size-4" />
              </button>
              <span className="min-w-5 text-center text-sm font-semibold text-gray-900">
                {item.quantity}
              </span>
              <button
                type="button"
                aria-label={t("increaseQuantity", { product: item.name })}
                onClick={() => onQuantityChange?.(item, item.quantity + 1)}
                className="grid size-9 place-items-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-sm text-gray-600">
        <span>{t("subtotal")}</span>
        <span>
          {subtotal.toFixed(2)} {items[0]?.currency}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>{t("deliveryCostLabel")}</span>
        <span>
          {deliveryCost.toFixed(2)} {items[0]?.currency}
        </span>
      </div>

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

      <button
        type="submit"
        form="checkout-order-form"
        disabled={!canSubmit || isSubmitting}
        className="store-theme-primary-button sticky bottom-0 mt-auto hidden min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-violet-200 disabled:text-violet-500 disabled:shadow-none lg:flex"
      >
        {isSubmitting ? t("submitting") : t("submit")}
        <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
