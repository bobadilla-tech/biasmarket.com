import { ConflictException, GoneException } from "@nestjs/common";
import { normalizePhone } from "@biasmarket/utils/phone-country";
import type {
  CreateOrderDto,
  ShippingAddressDto,
} from "../dto/create-order.dto.js";

const PAYLOAD_MISMATCH =
  "El Idempotency-Key ya fue utilizado con datos de orden diferentes";

export const CHECKOUT_REPLAY_FIELDS = [
  "deliveryMethodType",
  "pickupPointId",
  "pickupDate",
  "paymentMethod",
  "paymentType",
  "customerPhone",
  "customerName",
  "customerEmail",
  "shippingAddress",
  "courierName",
  "courierModality",
  "items",
] as const satisfies readonly (keyof CreateOrderDto)[];

export const SHIPPING_REPLAY_FIELDS = [
  "recipientName",
  "recipientSurnames",
  "phone",
  "documentType",
  "documentNumber",
  "department",
  "province",
  "district",
  "line1",
  "line2",
  "city",
  "region",
  "reference",
  "agencyName",
] as const satisfies readonly (keyof ShippingAddressDto)[];

export const INTENTIONALLY_UNCOMPARED_CHECKOUT_FIELDS: readonly string[] = [];
export const INTENTIONALLY_UNCOMPARED_SHIPPING_FIELDS: readonly string[] = [];

interface CheckoutReplayOrder {
  customerPhone: string;
  customerEmail: string | null;
  customerName: string | null;
  paymentMethod: string | null;
  paymentType: string | null;
  deliveryMethodType: string;
  pickupPointId: string | null;
  pickupDate: Date | null;
  courierName: string | null;
  courierModality: string | null;
  deliveryDetails: unknown;
  status: "ACTIVE" | "CANCELLED";
  paymentStatus:
    | "PENDING_PAYMENT"
    | "PARTIALLY_PAID"
    | "PAYMENT_SUBMITTED"
    | "VERIFIED"
    | "REJECTED"
    | "CANCELLED";
  expiresAt: Date;
  items: Array<{
    productId: string;
    variantId: string | null;
    quantity: number;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function storedShippingAddress(
  value: unknown,
  deliveryMethodType: string,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value.shippingAddress;
  if (isRecord(nested)) return nested;
  return deliveryMethodType === "COURIER" ? value : null;
}

function nullableEqual(left: unknown, right: unknown): boolean {
  return (left ?? null) === (right ?? null);
}

function shippingMatches(
  stored: Record<string, unknown> | null,
  submitted: ShippingAddressDto | undefined,
): boolean {
  if (!stored && !submitted) return true;
  if (!stored || !submitted) return false;

  for (const field of SHIPPING_REPLAY_FIELDS) {
    if (field === "phone") {
      if (
        normalizePhone(String(stored.phone ?? "")) !==
        normalizePhone(submitted.phone ?? "")
      ) {
        return false;
      }
    } else if (!nullableEqual(stored[field], submitted[field])) {
      return false;
    }
  }
  return true;
}

function payloadMatches(
  order: CheckoutReplayOrder,
  dto: CreateOrderDto,
): boolean {
  if (
    normalizePhone(order.customerPhone) !== normalizePhone(dto.customerPhone) ||
    (order.customerEmail ?? "").toLowerCase() !==
      (dto.customerEmail ?? "").toLowerCase() ||
    (order.customerName ?? "") !== (dto.customerName ?? "") ||
    (order.paymentMethod ?? null) !== (dto.paymentMethod ?? null) ||
    (order.paymentType ?? null) !== (dto.paymentType ?? null) ||
    order.deliveryMethodType !== dto.deliveryMethodType ||
    (order.pickupPointId ?? null) !== (dto.pickupPointId ?? null) ||
    (order.courierName ?? null) !== (dto.courierName ?? null) ||
    (order.courierModality ?? null) !== (dto.courierModality ?? null)
  ) {
    return false;
  }

  if (order.pickupPointId) {
    const storedDate = order.pickupDate?.toISOString().slice(0, 10) ?? null;
    if (storedDate !== (dto.pickupDate ?? null)) return false;
  }

  if (order.items.length !== dto.items.length) return false;
  const unmatchedItems = [...order.items];
  for (const item of dto.items) {
    const index = unmatchedItems.findIndex(
      (stored) =>
        stored.productId === item.productId &&
        (stored.variantId ?? null) === (item.variantId ?? null) &&
        stored.quantity === item.quantity,
    );
    if (index < 0) return false;
    unmatchedItems.splice(index, 1);
  }

  return shippingMatches(
    storedShippingAddress(order.deliveryDetails, order.deliveryMethodType),
    dto.shippingAddress,
  );
}

export function resolveReplay<T extends CheckoutReplayOrder>(
  order: T,
  dto: CreateOrderDto,
  now = new Date(),
): T {
  if (!payloadMatches(order, dto)) {
    throw new ConflictException(PAYLOAD_MISMATCH);
  }

  const expiredUnpaidHold =
    (order.paymentStatus === "PENDING_PAYMENT" ||
      order.paymentStatus === "PARTIALLY_PAID") &&
    order.expiresAt < now;
  if (
    order.status === "CANCELLED" ||
    order.paymentStatus === "CANCELLED" ||
    expiredUnpaidHold
  ) {
    throw new GoneException("Este pedido ya no está disponible");
  }

  return order;
}
