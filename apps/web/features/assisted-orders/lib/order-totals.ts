import type { CreateAssistedOrderDto } from "@biasmarket/types";
import type { AssistedOrderFormInput } from "@biasmarket/validation";
import { buildShippingAddressPayload } from "@/features/checkout/lib/delivery-rules";

// Money is summed in cents so a float artifact can never show a total the
// server (which uses Decimal) would not charge.
const toCents = (amount: string | number) => Math.round(Number(amount) * 100);

export interface PricedVariant {
  id: string;
  priceOverride: string | null;
  stock: number | null;
  reserved: number;
}

export interface PricedProduct {
  id: string;
  price: string;
  currency: string;
  variants: PricedVariant[];
}

interface LineItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export function unitPriceCents(
  product: PricedProduct,
  variantId: string,
): number {
  const variant = product.variants.find((v) => v.id === variantId);
  return toCents(variant?.priceOverride ?? product.price);
}

// Lines whose product detail has not loaded yet count as 0 until it does.
export function subtotalCents(
  items: LineItem[],
  products: ReadonlyMap<string, PricedProduct>,
): number {
  return items.reduce((sum, item) => {
    const product = products.get(item.productId);
    if (!product || !Number.isFinite(item.quantity)) return sum;
    return sum + unitPriceCents(product, item.variantId) * item.quantity;
  }, 0);
}

export function orderCurrency(
  items: LineItem[],
  products: ReadonlyMap<string, PricedProduct>,
): string {
  for (const item of items) {
    const product = products.get(item.productId);
    if (product) return product.currency;
  }
  return "PEN";
}

export function hasMixedCurrencies(
  items: LineItem[],
  products: ReadonlyMap<string, PricedProduct>,
): boolean {
  const currencies = new Set(
    items.flatMap((item) => {
      const product = products.get(item.productId);
      return product ? [product.currency] : [];
    }),
  );
  return currencies.size > 1;
}

export const centsToAmount = (cents: number) => cents / 100;

// Maps the flat form values to the API body. Empty strings become undefined,
// the alias is trimmed, and pickup/courier fields only travel with their own
// delivery method (the server rejects a pickupDate on anything else).
export function buildAssistedOrderPayload(
  values: AssistedOrderFormInput,
  pointsRequiringDate: ReadonlySet<string>,
): CreateAssistedOrderDto {
  const isPickup = values.deliveryMethodType === "PICKUP";
  const isCourier = values.deliveryMethodType === "COURIER";
  return {
    deliveryMethodType: values.deliveryMethodType as "PICKUP" | "COURIER",
    customerPhone: values.customerPhone,
    customerName: values.customerName.trim() || undefined,
    items: values.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId || undefined,
      quantity: item.quantity,
    })),
    pickupPointId: isPickup ? values.pickupPointId || undefined : undefined,
    pickupDate:
      isPickup && pointsRequiringDate.has(values.pickupPointId)
        ? values.pickupDate
        : undefined,
    paymentMethod: (values.paymentMethod || undefined) as
      CreateAssistedOrderDto["paymentMethod"] | undefined,
    paymentType: values.paymentType,
    courierName: isCourier ? values.courierName : undefined,
    courierModality: isCourier
      ? (values.courierModality as "AGENCY" | "HOME")
      : undefined,
    shippingAddress: isCourier
      ? buildShippingAddressPayload(values)
      : undefined,
  };
}
