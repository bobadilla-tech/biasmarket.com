import type { WhatsAppBuyerNoticeType } from "@biasmarket/utils/whatsapp";
import type { OrderResponseDto } from "@biasmarket/types";

// There is no "packed" notice: no fulfillment status exists for it.
const FULFILLMENT_NOTICE: Partial<
  Record<OrderResponseDto["fulfillmentStatus"], WhatsAppBuyerNoticeType>
> = {
  IN_TRANSIT: "ASSISTED_IN_TRANSIT",
  READY: "ASSISTED_READY",
  COMPLETED: "ASSISTED_DELIVERED",
};

export function noticeForFulfillment(
  status: string,
): WhatsAppBuyerNoticeType | null {
  return (
    FULFILLMENT_NOTICE[status as OrderResponseDto["fulfillmentStatus"]] ?? null
  );
}

// Decides from the REFETCHED order, never from the mutation variables: the
// change may have landed differently than requested (e.g. a partial payment).
export function isNoticeApplicable(
  order: Pick<
    OrderResponseDto,
    "source" | "paymentStatus" | "fulfillmentStatus" | "status"
  >,
  notice: WhatsAppBuyerNoticeType,
): boolean {
  if (order.source !== "VENDOR_ASSISTED") return false;
  if (order.status === "CANCELLED") return false;
  switch (notice) {
    case "ASSISTED_PAYMENT_VALIDATED":
      return order.paymentStatus === "VERIFIED";
    case "ASSISTED_IN_TRANSIT":
      return order.fulfillmentStatus === "IN_TRANSIT";
    case "ASSISTED_READY":
      return order.fulfillmentStatus === "READY";
    case "ASSISTED_DELIVERED":
      return order.fulfillmentStatus === "COMPLETED";
  }
}
