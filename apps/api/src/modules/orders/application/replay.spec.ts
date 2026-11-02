import { ConflictException, GoneException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type {
  CreateOrderDto,
  ShippingAddressDto,
} from "../dto/create-order.dto.js";
import {
  CHECKOUT_REPLAY_FIELDS,
  INTENTIONALLY_UNCOMPARED_CHECKOUT_FIELDS,
  INTENTIONALLY_UNCOMPARED_SHIPPING_FIELDS,
  resolveReplay,
  SHIPPING_REPLAY_FIELDS,
} from "./replay.js";

const pickupDto: CreateOrderDto = {
  deliveryMethodType: "PICKUP",
  pickupPointId: "pickup-1",
  pickupDate: "2026-12-01",
  paymentMethod: "YAPE",
  paymentType: "FULL",
  customerPhone: "+51988888888",
  customerName: "Buyer",
  customerEmail: "Buyer@example.com",
  items: [{ productId: "product-1", variantId: "variant-1", quantity: 2 }],
};

const shippingAddress: ShippingAddressDto = {
  recipientName: "Buyer",
  recipientSurnames: "Buyer Surname",
  phone: "+51988888888",
  documentType: "DNI",
  documentNumber: "12345678",
  department: "Lima",
  province: "Lima",
  district: "Miraflores",
  line1: "Av. Example 123",
  line2: "Apt. 4",
  city: "Miraflores",
  region: "Lima",
  reference: "Near the park",
  agencyName: "Example Agency",
};

function orderFor(
  dto: CreateOrderDto = pickupDto,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "order-1",
    customerPhone: dto.customerPhone,
    customerEmail: dto.customerEmail ?? null,
    customerName: dto.customerName ?? null,
    paymentMethod: dto.paymentMethod ?? null,
    paymentType: dto.paymentType ?? null,
    deliveryMethodType: dto.deliveryMethodType,
    pickupPointId: dto.pickupPointId ?? null,
    pickupDate: dto.pickupDate
      ? new Date(`${dto.pickupDate}T00:00:00.000Z`)
      : null,
    courierName: dto.courierName ?? null,
    courierModality: dto.courierModality ?? null,
    deliveryDetails: dto.shippingAddress
      ? { shippingAddress: { ...dto.shippingAddress } }
      : { pickupPointLabel: "Main point" },
    status: "ACTIVE" as const,
    paymentStatus: "PENDING_PAYMENT" as const,
    expiresAt: new Date("2026-12-03T00:00:00.000Z"),
    items: dto.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantity: item.quantity,
    })),
    ...overrides,
  };
}

describe("resolveReplay payload comparison", () => {
  it("accounts for every CreateOrderDto and ShippingAddressDto field", () => {
    const dtoFixture = {
      deliveryMethodType: "PICKUP",
      pickupPointId: "pickup-1",
      pickupDate: "2026-12-01",
      paymentMethod: "YAPE",
      paymentType: "FULL",
      customerPhone: "+51988888888",
      customerName: "Buyer",
      customerEmail: "buyer@example.com",
      shippingAddress,
      courierName: "Olva",
      courierModality: "HOME",
      items: pickupDto.items,
    } satisfies CreateOrderDto;
    const shippingFixture = shippingAddress satisfies ShippingAddressDto;

    expect(
      [
        ...CHECKOUT_REPLAY_FIELDS,
        ...INTENTIONALLY_UNCOMPARED_CHECKOUT_FIELDS,
      ].sort(),
    ).toEqual(Object.keys(dtoFixture).sort());
    expect(
      [
        ...SHIPPING_REPLAY_FIELDS,
        ...INTENTIONALLY_UNCOMPARED_SHIPPING_FIELDS,
      ].sort(),
    ).toEqual(Object.keys(shippingFixture).sort());
  });

  it.each([
    ["customerPhone", { customerPhone: "+51900000000" }],
    ["customerName", { customerName: "Different" }],
    ["customerEmail", { customerEmail: "different@example.com" }],
    ["paymentMethod", { paymentMethod: "PLIN" }],
    ["paymentType", { paymentType: "PARTIAL" }],
    ["deliveryMethodType", { deliveryMethodType: "COURIER" }],
    ["pickupPointId", { pickupPointId: "pickup-2" }],
    ["pickupDate", { pickupDate: "2026-12-02" }],
    ["courierName", { courierName: "Olva" }],
    ["courierModality", { courierModality: "HOME" }],
    [
      "items productId",
      {
        items: [
          { productId: "product-2", variantId: "variant-1", quantity: 2 },
        ],
      },
    ],
    [
      "items variantId",
      {
        items: [
          { productId: "product-1", variantId: "variant-2", quantity: 2 },
        ],
      },
    ],
    [
      "items quantity",
      {
        items: [
          { productId: "product-1", variantId: "variant-1", quantity: 3 },
        ],
      },
    ],
  ])("returns 409 when %s changes", (_field, delta) => {
    const changed = { ...pickupDto, ...delta } as CreateOrderDto;
    expect(() => resolveReplay(orderFor(), changed)).toThrow(ConflictException);
  });

  it("allows case-insensitive email comparison and equivalent phone formatting", () => {
    const dto = {
      ...pickupDto,
      customerPhone: "988888888",
      customerEmail: "buyer@EXAMPLE.com",
    };
    expect(resolveReplay(orderFor(), dto)).toMatchObject({ id: "order-1" });
  });

  it("compares line items as a multiset, including repeated products", () => {
    const dto = {
      ...pickupDto,
      items: [
        { productId: "product-1", variantId: "variant-1", quantity: 1 },
        { productId: "product-1", variantId: "variant-1", quantity: 1 },
      ],
    };
    const order = orderFor(dto);
    expect(
      resolveReplay(order, { ...dto, items: [...dto.items].reverse() }),
    ).toBe(order);
  });

  it("normalizes the stored UTC pickup date to the submitted date", () => {
    const order = orderFor(pickupDto, {
      pickupDate: new Date("2026-12-01T00:00:00.000Z"),
    });
    expect(resolveReplay(order, pickupDto)).toBe(order);
    expect(() =>
      resolveReplay(order, { ...pickupDto, pickupDate: "2026-12-02" }),
    ).toThrow(ConflictException);
  });

  it.each(SHIPPING_REPLAY_FIELDS)("compares shipping field %s", (field) => {
    const dto: CreateOrderDto = {
      ...pickupDto,
      deliveryMethodType: "COURIER",
      pickupPointId: undefined,
      pickupDate: undefined,
      courierName: "Olva",
      courierModality: "HOME",
      shippingAddress,
    };
    const changedAddress = { ...shippingAddress, [field]: "changed" };
    expect(() =>
      resolveReplay(orderFor(dto), { ...dto, shippingAddress: changedAddress }),
    ).toThrow(ConflictException);
  });

  it("normalizes shipping phone and conflicts if a courier address is omitted", () => {
    const dto: CreateOrderDto = {
      ...pickupDto,
      deliveryMethodType: "COURIER",
      pickupPointId: undefined,
      pickupDate: undefined,
      courierName: "Olva",
      courierModality: "HOME",
      shippingAddress,
    };
    const order = orderFor(dto);
    expect(
      resolveReplay(order, {
        ...dto,
        shippingAddress: { ...shippingAddress, phone: "988888888" },
      }),
    ).toBe(order);
    expect(() =>
      resolveReplay(order, { ...dto, shippingAddress: undefined }),
    ).toThrow(ConflictException);
  });
});

describe("resolveReplay expiry rules", () => {
  const expiry = new Date("2026-12-03T00:00:00.000Z");

  it.each([
    ["PENDING_PAYMENT", -1, "replay"],
    ["PENDING_PAYMENT", 0, "replay"],
    ["PENDING_PAYMENT", 1, "gone"],
    ["PARTIALLY_PAID", -1, "replay"],
    ["PARTIALLY_PAID", 0, "replay"],
    ["PARTIALLY_PAID", 1, "gone"],
    ["PAYMENT_SUBMITTED", 1, "replay"],
    ["VERIFIED", 1, "replay"],
    ["REJECTED", 1, "replay"],
  ] as const)(
    "%s at expiresAt %+dms => %s",
    (paymentStatus, offset, outcome) => {
      const order = orderFor(pickupDto, { paymentStatus, expiresAt: expiry });
      const now = new Date(expiry.getTime() + offset);
      if (outcome === "gone") {
        expect(() => resolveReplay(order, pickupDto, now)).toThrow(
          GoneException,
        );
      } else {
        expect(resolveReplay(order, pickupDto, now)).toBe(order);
      }
    },
  );

  it("returns 410 for either cancelled status even with a future expiry", () => {
    const now = new Date("2026-12-01T00:00:00.000Z");
    expect(() =>
      resolveReplay(
        orderFor(pickupDto, { status: "CANCELLED" }),
        pickupDto,
        now,
      ),
    ).toThrow(GoneException);
    expect(() =>
      resolveReplay(
        orderFor(pickupDto, { paymentStatus: "CANCELLED" }),
        pickupDto,
        now,
      ),
    ).toThrow(GoneException);
  });

  it("returns 409 for mismatched data before checking whether the order is dead", () => {
    const cancelled = orderFor(pickupDto, { status: "CANCELLED" });
    expect(() =>
      resolveReplay(cancelled, { ...pickupDto, customerName: "Different" }),
    ).toThrow(ConflictException);
  });
});
