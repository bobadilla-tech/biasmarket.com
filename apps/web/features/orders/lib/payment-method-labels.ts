import type { useTranslations } from "next-intl";

// Shared text-label map for the four PaymentMethodType values (YAPE/PLIN/
// TRANSFER/CASH). Duplicated once in register-payment-form.tsx and once in
// payment-history-list.tsx before this helper existed — text-only by design,
// since register-payment-form renders it inside a native <option>, where an
// <Image>/logo can't render.
export function paymentMethodLabels(
  t: ReturnType<typeof useTranslations>,
): Record<string, string> {
  return {
    YAPE: t("paymentMethodLabels.YAPE"),
    PLIN: t("paymentMethodLabels.PLIN"),
    TRANSFER: t("paymentMethodLabels.TRANSFER"),
    CASH: t("paymentMethodLabels.CASH"),
  };
}
