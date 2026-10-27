import { describe, expect, test } from "vitest";
import type { AssistedOrderFormInput } from "@biasmarket/validation";
import {
  buildAssistedOrderPayload,
  hasMixedCurrencies,
  orderCurrency,
  subtotalCents,
  unitPriceCents,
  type PricedProduct,
} from "./order-totals";

const album: PricedProduct = {
  id: "album",
  price: "25.00",
  currency: "PEN",
  variants: [
    { id: "v-std", priceOverride: null, stock: 10, reserved: 0 },
    { id: "v-lim", priceOverride: "40.50", stock: 2, reserved: 1 },
  ],
};
const sticker: PricedProduct = {
  id: "sticker",
  price: "0.10",
  currency: "PEN",
  variants: [],
};
const dollars: PricedProduct = {
  id: "usd",
  price: "5.00",
  currency: "USD",
  variants: [],
};
const products = new Map([album, sticker, dollars].map((p) => [p.id, p]));

describe("pricing", () => {
  test("a variant override replaces the product price", () => {
    expect(unitPriceCents(album, "v-std")).toBe(2500);
    expect(unitPriceCents(album, "v-lim")).toBe(4050);
    expect(unitPriceCents(sticker, "")).toBe(10);
  });

  test("sums in cents without float drift", () => {
    expect(
      subtotalCents(
        [
          { productId: "sticker", variantId: "", quantity: 3 },
          { productId: "album", variantId: "v-lim", quantity: 2 },
        ],
        products,
      ),
    ).toBe(30 + 8100);
  });

  test("lines whose product has not loaded count as 0", () => {
    expect(
      subtotalCents(
        [{ productId: "ghost", variantId: "", quantity: 2 }],
        products,
      ),
    ).toBe(0);
  });

  test("currency is the first known product's; mixed currencies are flagged", () => {
    const items = [
      { productId: "album", variantId: "v-std", quantity: 1 },
      { productId: "usd", variantId: "", quantity: 1 },
    ];
    expect(orderCurrency(items, products)).toBe("PEN");
    expect(hasMixedCurrencies(items, products)).toBe(true);
    expect(hasMixedCurrencies(items.slice(0, 1), products)).toBe(false);
  });
});

const base: AssistedOrderFormInput = {
  customerPhone: "987 654 321",
  customerName: "  Sofi ",
  items: [{ productId: "album", variantId: "", quantity: 2 }],
  deliveryMethodType: "PICKUP",
  pickupPointId: "p1",
  pickupDate: "2026-11-03",
  paymentMethod: "YAPE",
  paymentType: "PARTIAL",
  courierName: "",
  courierModality: "",
  shippingRecipientName: "",
  shippingRecipientSurnames: "",
  shippingPhone: "",
  shippingDocumentType: "",
  shippingDocumentNumber: "",
  shippingDepartment: "",
  shippingProvince: "",
  shippingDistrict: "",
  shippingLine1: "",
  shippingLine2: "",
  shippingCity: "",
  shippingRegion: "",
  shippingReference: "",
  shippingAgencyName: "",
};

describe("buildAssistedOrderPayload", () => {
  test("pickup: trims the alias, keeps the date only for date-requiring points", () => {
    const withDate = buildAssistedOrderPayload(base, new Set(["p1"]));
    expect(withDate).toMatchObject({
      deliveryMethodType: "PICKUP",
      customerPhone: "987 654 321",
      customerName: "Sofi",
      pickupPointId: "p1",
      pickupDate: "2026-11-03",
      paymentMethod: "YAPE",
      paymentType: "PARTIAL",
      items: [{ productId: "album", variantId: undefined, quantity: 2 }],
    });
    expect(withDate.shippingAddress).toBeUndefined();
    expect(withDate.courierName).toBeUndefined();

    expect(
      buildAssistedOrderPayload(base, new Set()).pickupDate,
    ).toBeUndefined();
  });

  test("an empty alias and payment method become undefined", () => {
    const payload = buildAssistedOrderPayload(
      { ...base, customerName: "   ", paymentMethod: "" },
      new Set(),
    );
    expect(payload.customerName).toBeUndefined();
    expect(payload.paymentMethod).toBeUndefined();
  });

  test("courier: sends courier and address, never pickup fields", () => {
    const payload = buildAssistedOrderPayload(
      {
        ...base,
        deliveryMethodType: "COURIER",
        courierName: "Olva",
        courierModality: "HOME",
        shippingRecipientName: "Ana",
        shippingPhone: "999111222",
        shippingLine1: "Av. Larco 123",
        shippingCity: "Lima",
      },
      new Set(["p1"]),
    );
    expect(payload).toMatchObject({
      deliveryMethodType: "COURIER",
      courierName: "Olva",
      courierModality: "HOME",
      shippingAddress: {
        recipientName: "Ana",
        phone: "999111222",
        line1: "Av. Larco 123",
        city: "Lima",
      },
    });
    expect(payload.pickupPointId).toBeUndefined();
    expect(payload.pickupDate).toBeUndefined();
  });

  test("never includes fields the API forbids", () => {
    const payload = buildAssistedOrderPayload(base, new Set());
    for (const forbidden of [
      "customerEmail",
      "source",
      "createdByUserId",
      "expiresAt",
      "storeId",
    ]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });
});
