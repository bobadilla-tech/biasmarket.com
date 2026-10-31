import type { Prisma } from "@biasmarket/db";
import type {
  PublicOrderTimelineItemDto,
  PublicTimelineEventType,
} from "../dto/public-order-response.dto.js";

// The only event types a buyer sees on the timeline. LINK_OPENED,
// LINK_REGENERATED, PHONE_CORRECTED, BUYER_NOTIFIED and INVITE_* describe the
// seller's workflow or the funnel, not the order.
const TIMELINE_TYPES: ReadonlySet<string> = new Set<PublicTimelineEventType>([
  "CREATED",
  "PAYMENT_SUBMITTED",
  "PAYMENT_VALIDATED",
  "PAYMENT_REJECTED",
  "PAYMENT_VOIDED",
  "FULFILLMENT_ADVANCED",
  "PACKED_PHOTO_ADDED",
  "TRACKING_ADDED",
  "RECEIPT_CONFIRMED",
  "CLAIMED",
  "ORDER_CANCELLED",
]);

const RESOLUTIONS = new Set(["REFUNDED", "RETAINED", "STORE_CREDIT"]);
const FULFILLMENT_STEPS = new Set([
  "ORDERING",
  "IN_TRANSIT",
  "READY",
  "COMPLETED",
]);

export interface StoredBuyerEvent {
  type: string;
  createdAt: Date;
  payload: Prisma.JsonValue;
}

export function isTimelineEvent(event: { type: string }): boolean {
  return TIMELINE_TYPES.has(event.type);
}

// PICKS fields per event type; the stored payload is never spread. `paymentId`
// and any seller free text are not reachable from here by construction.
export function toPublicTimeline(
  events: StoredBuyerEvent[],
): PublicOrderTimelineItemDto[] {
  return events.filter(isTimelineEvent).map((event) => {
    const payload =
      event.payload &&
      typeof event.payload === "object" &&
      !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : {};
    const type = event.type as PublicTimelineEventType;
    const toStatus =
      type === "FULFILLMENT_ADVANCED" &&
      typeof payload.toStatus === "string" &&
      FULFILLMENT_STEPS.has(payload.toStatus)
        ? payload.toStatus
        : null;
    const hasAmount = type === "PAYMENT_SUBMITTED" || type === "PAYMENT_VOIDED";
    const amount =
      hasAmount &&
      (typeof payload.amount === "number" || typeof payload.amount === "string")
        ? String(payload.amount)
        : null;
    const resolution =
      type === "ORDER_CANCELLED" &&
      typeof payload.resolution === "string" &&
      RESOLUTIONS.has(payload.resolution)
        ? payload.resolution
        : null;
    return {
      type,
      at: event.createdAt.toISOString(),
      toStatus: toStatus as PublicOrderTimelineItemDto["toStatus"],
      amount,
      resolution: resolution as PublicOrderTimelineItemDto["resolution"],
    };
  });
}
