import type { PublicOrderResponseDto } from "@biasmarket/types";

// Mirrors the API gate (OrderEventsService.confirmReceipt): the button is a
// convenience, the server is the authority.
export function canConfirmReceipt(
  order: Pick<
    PublicOrderResponseDto,
    "paymentStatus" | "status" | "fulfillmentStatus"
  >,
): boolean {
  return (
    order.paymentStatus === "VERIFIED" &&
    order.status !== "CANCELLED" &&
    order.fulfillmentStatus !== "ORDERING"
  );
}
