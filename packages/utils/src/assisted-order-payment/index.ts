export type AssistedPaymentType = "FULL" | "PARTIAL" | undefined;
export type AssistedDeliveryType = "PICKUP" | "COURIER";

export const ASSISTED_PICKUP_DEPOSIT_PERCENT = 30;

/** Returns the required amount in cents, or null for an invalid partial courier order. */
export function assistedRequiredAmountCents(
  totalCents: number,
  deliveryMethodType: AssistedDeliveryType,
  paymentType: AssistedPaymentType,
): number | null {
  if (paymentType !== "PARTIAL") return totalCents;
  if (deliveryMethodType !== "PICKUP") return null;
  return Math.round((totalCents * ASSISTED_PICKUP_DEPOSIT_PERCENT) / 100);
}
