"use client";

import { useLocale, useTranslations } from "next-intl";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { ContactSellerButton } from "@/features/customer-auth/components/contact-seller-button";
import { formatOrderDate } from "@/features/orders/lib/order-format";
import { useConfirmReceipt } from "../mutations/use-confirm-receipt";
import { canConfirmReceipt } from "../lib/receipt";

export function ReceiptConfirmation({
  slug,
  token,
  order,
  onConfirmed,
}: {
  slug: string;
  token: string;
  order: PublicOrderResponseDto;
  onConfirmed?: () => void;
}) {
  const t = useTranslations("storefront.publicOrder");
  const locale = useLocale();
  const confirm = useConfirmReceipt(token);
  // Defensive: an API that predates the field omits it.
  const confirmedAt = order.receiptConfirmedAt ?? null;

  if (confirmedAt) {
    return (
      <section
        aria-labelledby="public-order-receipt"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
      >
        <h2 id="public-order-receipt" className="font-semibold">
          {t("receipt.thanks")}
        </h2>
        <p className="mt-1 text-xs">
          {t("receipt.confirmedOn", {
            date: formatOrderDate(confirmedAt, locale, t),
          })}
        </p>
      </section>
    );
  }

  if (!canConfirmReceipt(order)) return null;

  return (
    <section
      aria-labelledby="public-order-receipt"
      className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
    >
      <h2
        id="public-order-receipt"
        className="text-sm font-semibold text-gray-900"
      >
        {t("receipt.title")}
      </h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() =>
            confirm.mutate(undefined, { onSuccess: () => onConfirmed?.() })
          }
          disabled={confirm.isPending}
          className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {t("receipt.confirm")}
        </button>
        <ContactSellerButton
          slug={slug}
          message={t("receipt.problemMessage", {
            number: order.orderNumber ?? "",
          })}
          label={t("receipt.problem")}
        />
      </div>
      {confirm.isError && (
        <p role="alert" className="text-xs text-rose-600">
          {t("receipt.error")}
        </p>
      )}
    </section>
  );
}
