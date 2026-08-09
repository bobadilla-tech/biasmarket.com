import type { useTranslations } from "next-intl";
import type { OrderResponseDto } from "@biasmarket/types";

export function getOrderNumber(orderId: string) {
  return `#${orderId.slice(-4).toUpperCase()}`;
}

export function getInitials(name: string | null, phone: string) {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const initialA = parts[0]?.slice(0, 1) ?? "";
    const initialB = parts[1]?.slice(0, 1) ?? "";
    return `${initialA}${initialB}`.toUpperCase() ||
      source.slice(0, 2).toUpperCase();
  }
  return phone.slice(-2).toUpperCase();
}

export function formatOrderDate(
  createdAt: string,
  locale: string,
  t: ReturnType<typeof useTranslations>,
) {
  const date = new Date(createdAt);
  const now = new Date();
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  const isToday = now.toDateString() === date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();

  if (isToday) return t("date.today", { time });
  if (isYesterday) return t("date.yesterday", { time });

  const day = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
  }).format(date);
  return `${day} ${time}`;
}

export function getDeliveryLabel(
  order: OrderResponseDto,
  t: ReturnType<typeof useTranslations>,
) {
  const details = order.deliveryDetails ?? {};
  if (order.deliveryMethodType === "PICKUP") {
    const address = typeof details.address === "string"
      ? details.address.trim()
      : "";
    return address
      ? `${t("delivery.pickup")} - ${address}`
      : t("delivery.pickup");
  }

  const costRaw = details.estimatedCost;
  const cost = typeof costRaw === "number"
    ? costRaw
    : typeof costRaw === "string"
    ? Number(costRaw)
    : undefined;
  if (typeof cost === "number" && Number.isFinite(cost) && cost > 0) {
    return `${t("delivery.courier")} - ${
      t("delivery.estimatedCost", { cost })
    }`;
  }
  return t("delivery.courier");
}

// Snapshotted verbatim into Order.deliveryDetails.shippingAddress at
// checkout for COURIER orders (see create-order.usecase.ts) — never read
// server-side afterwards, only rendered here for the seller. `null` for
// PICKUP orders and for pre-existing COURIER orders created before this
// field existed.
export interface OrderShippingAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  reference?: string;
}

export function getShippingAddress(
  order: OrderResponseDto,
): OrderShippingAddress | null {
  if (order.deliveryMethodType !== "COURIER") return null;
  const details = order.deliveryDetails ?? {};
  const address = details.shippingAddress;
  if (
    !address || typeof address !== "object" ||
    typeof (address as Record<string, unknown>).recipientName !== "string" ||
    typeof (address as Record<string, unknown>).phone !== "string" ||
    typeof (address as Record<string, unknown>).line1 !== "string" ||
    typeof (address as Record<string, unknown>).city !== "string"
  ) {
    return null;
  }
  return address as OrderShippingAddress;
}

export function getProductSummary(
  order: OrderResponseDto,
  t: ReturnType<typeof useTranslations>,
) {
  const first = order.items?.[0];
  if (!first) return t("unknownProduct");
  const base = first.variant?.name
    ? `${first.product.name} (${first.variant.name})`
    : first.product.name;
  const moreCount = (order.items?.length ?? 0) - 1;
  if (moreCount > 0) {
    return t("productSummaryMore", { product: base, count: moreCount });
  }
  return base;
}
