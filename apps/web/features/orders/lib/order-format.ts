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
    return (
      `${initialA}${initialB}`.toUpperCase() || source.slice(0, 2).toUpperCase()
    );
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
    const address =
      typeof details.address === "string" ? details.address.trim() : "";
    return address
      ? `${t("delivery.pickup")} - ${address}`
      : t("delivery.pickup");
  }

  const costRaw = details.estimatedCost;
  const cost =
    typeof costRaw === "number"
      ? costRaw
      : typeof costRaw === "string"
        ? Number(costRaw)
        : undefined;
  if (typeof cost === "number" && Number.isFinite(cost) && cost > 0) {
    return `${t("delivery.courier")} - ${t("delivery.estimatedCost", {
      cost,
    })}`;
  }
  return t("delivery.courier");
}

// Snapshotted verbatim into Order.deliveryDetails.shippingAddress at
// checkout for COURIER orders (see create-order.usecase.ts) — never read
// server-side afterwards, only rendered here for the seller. Every field is
// optional: a HOME order carries line1/city, an AGENCY order carries
// agencyName instead, and older orders may carry only recipientName/phone.
// `null` only when nothing shippable is present at all.
export interface OrderShippingAddress {
  recipientName?: string;
  recipientSurnames?: string;
  phone?: string;
  documentType?: string;
  documentNumber?: string;
  department?: string;
  province?: string;
  district?: string;
  agencyName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  reference?: string;
}

const SHIPPING_ADDRESS_FIELDS: (keyof OrderShippingAddress)[] = [
  "recipientName",
  "recipientSurnames",
  "phone",
  "documentType",
  "documentNumber",
  "department",
  "province",
  "district",
  "agencyName",
  "line1",
  "line2",
  "city",
  "region",
  "reference",
];

export function getShippingAddress(
  order: OrderResponseDto,
): OrderShippingAddress | null {
  if (order.deliveryMethodType !== "COURIER") return null;
  const details = order.deliveryDetails ?? {};
  const raw = details.shippingAddress;
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;

  const out: OrderShippingAddress = {};
  for (const field of SHIPPING_ADDRESS_FIELDS) {
    const value = rec[field];
    if (typeof value === "string" && value.trim()) out[field] = value;
  }
  // Return an object whenever any shipping field is present — an AGENCY order
  // has no line1/city, so the old "all four required" guard hid it entirely.
  return Object.keys(out).length > 0 ? out : null;
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
