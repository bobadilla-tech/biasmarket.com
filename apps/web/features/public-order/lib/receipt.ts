import type { PublicOrderResponseDto } from "@biasmarket/types";
import { isReceiptFulfillmentState } from "@biasmarket/utils/order-receipt";

// Mirrors the API gate (OrderEventsService.confirmReceipt) through the shared
// `@biasmarket/utils/order-receipt` list: the button is a convenience, the
// server is the authority.
export function canConfirmReceipt(
  order: Pick<
    PublicOrderResponseDto,
    "paymentStatus" | "status" | "fulfillmentStatus"
  >,
): boolean {
  return (
    order.paymentStatus === "VERIFIED" &&
    order.status !== "CANCELLED" &&
    isReceiptFulfillmentState(order.fulfillmentStatus)
  );
}
