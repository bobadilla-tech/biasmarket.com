import type { useTranslations } from "next-intl";
import type { OrderResponseDto } from "@biasmarket/types";

export const NEXT_FULFILLMENT: Record<string, string | undefined> = {
  ORDERING: "IN_TRANSIT",
  IN_TRANSIT: "READY",
  READY: "COMPLETED",
  COMPLETED: undefined,
};

// Sensitive = hard to revert / strong customer impact -> confirm modal.
// Everything else = frequent, low-risk -> optimistic change + undo toast.
export const SENSITIVE_FULFILLMENT = new Set(["COMPLETED"]);

export type OrdersTab = "all" | "pending" | "transit" | "delivered";

// Every function here only reads these two fields — narrowed to a Pick
// (not the full `OrderResponseDto`) so callers with a smaller,
// locally-shaped order object (e.g. features/customers' customer-detail
// order rows) don't need to fabricate the full response shape just to get
// a status badge or tab filter.
type OrderStatusFields = Pick<
  OrderResponseDto,
  "paymentStatus" | "fulfillmentStatus" | "pendingAmount"
>;

export function getOrderStatus(
  order: OrderStatusFields,
  t: ReturnType<typeof useTranslations>,
) {
  if (order.paymentStatus === "REJECTED") {
    return { label: t("status.rejected"), className: "bg-red-50 text-red-700" };
  }
  if (order.paymentStatus === "CANCELLED") {
    return {
      label: t("status.cancelled"),
      className: "bg-slate-100 text-slate-700",
    };
  }
  if (order.paymentStatus === "PARTIALLY_PAID") {
    return {
      label: t("status.partial"),
      className:
        "border border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50 text-sky-800 shadow-sm",
    };
  }
  if (order.paymentStatus !== "VERIFIED") {
    return {
      label: t("status.toConfirm"),
      className: "bg-violet-50 text-violet-700",
    };
  }
  if (order.fulfillmentStatus === "COMPLETED") {
    return {
      label: t("status.delivered"),
      className: "bg-emerald-50 text-emerald-700",
    };
  }
  if (
    order.fulfillmentStatus === "IN_TRANSIT" ||
    order.fulfillmentStatus === "READY"
  ) {
    return {
      label: t("status.inTransit"),
      className: "bg-pink-50 text-pink-700",
    };
  }
  return {
    label: t("status.pending"),
    className: "bg-amber-50 text-amber-700",
  };
}

export function paymentsLocked(order: OrderStatusFields) {
  if (order.paymentStatus === "CANCELLED") return true;
  if (order.paymentStatus === "REJECTED") return true;
  if (
    order.paymentStatus === "VERIFIED" &&
    Number(order.pendingAmount) <= 0
  ) {
    return true;
  }
  if (order.fulfillmentStatus === "COMPLETED") return true;

  return false;
}

/**
 * "pending" here means "needs seller attention" (not yet VERIFIED, or
 * VERIFIED but still sitting at ORDERING) — not literally "payment pending".
 */
export function matchesTab(order: OrderStatusFields, tab: OrdersTab) {
  if (tab === "all") return true;
  if (tab === "delivered") {
    return order.paymentStatus === "VERIFIED" &&
      order.fulfillmentStatus === "COMPLETED";
  }
  if (tab === "transit") {
    return (
      order.paymentStatus === "VERIFIED" &&
      (order.fulfillmentStatus === "IN_TRANSIT" ||
        order.fulfillmentStatus === "READY")
    );
  }
  return (
    order.paymentStatus !== "VERIFIED" ||
    (order.paymentStatus === "VERIFIED" &&
      order.fulfillmentStatus === "ORDERING")
  );
}
