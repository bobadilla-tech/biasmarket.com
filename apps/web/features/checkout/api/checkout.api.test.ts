import { afterEach, expect, test, vi } from "vitest";

const publicDeliveryConfigMock = { findEnabled: vi.fn() };
const publicPickupPointsMock = { findEnabled: vi.fn() };
const publicPaymentConfigMock = { findEnabled: vi.fn() };
const checkoutMock = { create: vi.fn() };
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicDeliveryConfig: publicDeliveryConfigMock,
    publicPickupPoints: publicPickupPointsMock,
    publicPaymentConfig: publicPaymentConfigMock,
    checkout: checkoutMock,
  },
}));

const { checkoutApi } = await import("./checkout.api");

afterEach(() => {
  publicDeliveryConfigMock.findEnabled.mockReset();
  publicPickupPointsMock.findEnabled.mockReset();
  publicPaymentConfigMock.findEnabled.mockReset();
  checkoutMock.create.mockReset();
});

test("getDeliveryOptions fetches all three public config endpoints for the slug", async () => {
  publicDeliveryConfigMock.findEnabled.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  publicPickupPointsMock.findEnabled.mockResolvedValue({
    weekday: 3,
    points: [{ id: "p1", label: "Main", enabled: true }],
  });
  publicPaymentConfigMock.findEnabled.mockResolvedValue([
    { method: "YAPE", enabled: true, details: {} },
  ]);

  const result = await checkoutApi.getDeliveryOptions("my-store");

  expect(publicDeliveryConfigMock.findEnabled).toHaveBeenCalledWith(
    "my-store",
  );
  expect(publicPickupPointsMock.findEnabled).toHaveBeenCalledWith("my-store");
  expect(publicPaymentConfigMock.findEnabled).toHaveBeenCalledWith("my-store");
  expect(result.methods).toHaveLength(1);
  expect(result.points).toHaveLength(1);
  expect(result.weekday).toBe(3);
  expect(result.paymentMethods).toHaveLength(1);
});

test("submit delegates to the generated Checkout.create, omitting empty optional fields", async () => {
  checkoutMock.create.mockResolvedValue({
    order: { id: "o1" },
    whatsappUrl: null,
  });

  const result = await checkoutApi.submit("my-store", {
    deliveryMethodType: "COURIER",
    customerPhone: "+51999999999",
    items: [{
      productId: "p1",
      variantId: undefined,
      quantity: 2,
      name: "T",
      price: 10,
      currency: "PEN",
    }],
  });

  expect(checkoutMock.create).toHaveBeenCalledWith(
    "my-store",
    {
      deliveryMethodType: "COURIER",
      pickupPointId: undefined,
      paymentMethod: undefined,
      customerName: undefined,
      customerPhone: "+51999999999",
      customerEmail: undefined,
      items: [{ productId: "p1", variantId: undefined, quantity: 2 }],
    },
    { fallbackErrorMessage: undefined },
  );
  expect(result.order.id).toBe("o1");
  expect(result.whatsappUrl).toBeNull();
});

test("submit forwards a selected payment method", async () => {
  checkoutMock.create.mockResolvedValue({
    order: { id: "o1" },
    whatsappUrl: null,
  });

  await checkoutApi.submit("my-store", {
    deliveryMethodType: "COURIER",
    paymentMethod: "YAPE",
    customerPhone: "+51999999999",
    items: [{
      productId: "p1",
      variantId: undefined,
      quantity: 2,
      name: "T",
      price: 10,
      currency: "PEN",
    }],
  });

  expect(checkoutMock.create).toHaveBeenCalledWith(
    "my-store",
    expect.objectContaining({ paymentMethod: "YAPE" }),
    { fallbackErrorMessage: undefined },
  );
});

test("submit forwards a selected pickup date", async () => {
  checkoutMock.create.mockResolvedValue({
    order: { id: "o1" },
    whatsappUrl: null,
  });

  await checkoutApi.submit("my-store", {
    deliveryMethodType: "PICKUP",
    pickupPointId: "point-1",
    pickupDate: "2026-08-10",
    customerPhone: "+51999999999",
    items: [{
      productId: "p1",
      variantId: undefined,
      quantity: 2,
      name: "T",
      price: 10,
      currency: "PEN",
    }],
  });

  expect(checkoutMock.create).toHaveBeenCalledWith(
    "my-store",
    expect.objectContaining({ pickupDate: "2026-08-10" }),
    { fallbackErrorMessage: undefined },
  );
});
