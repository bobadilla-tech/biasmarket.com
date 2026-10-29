// Fulfillment states in which a buyer can confirm receiving an order. One list
// for the API gate (OrderEventsService.confirmReceipt, which is the authority)
// and the web button (a convenience that must not drift from it).
export const RECEIPT_FULFILLMENT_STATES = [
  "IN_TRANSIT",
  "READY",
  "COMPLETED",
] as const;

export type ReceiptFulfillmentState =
  (typeof RECEIPT_FULFILLMENT_STATES)[number];

export function isReceiptFulfillmentState(
  status: string,
): status is ReceiptFulfillmentState {
  return (RECEIPT_FULFILLMENT_STATES as readonly string[]).includes(status);
}
