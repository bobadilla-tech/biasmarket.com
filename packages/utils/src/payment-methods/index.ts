export type CheckoutPaymentMethod = "YAPE" | "PLIN" | "TRANSFER" | "CASH";

export function isPaymentMethodConfigured(
  method: CheckoutPaymentMethod,
  details: Record<string, unknown> | null | undefined,
): boolean {
  const d = details ?? {};
  if (method === "CASH") return true;
  if (method === "TRANSFER") {
    return typeof d.bankName === "string" && !!d.bankName;
  }
  return (
    (typeof d.phoneNumber === "string" && !!d.phoneNumber) ||
    (typeof d.qrImageUrl === "string" && !!d.qrImageUrl)
  );
}
