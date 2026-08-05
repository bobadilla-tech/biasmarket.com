import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const publicDeliveryConfigMock = { findEnabled: vi.fn() };
const publicPickupPointsMock = { findEnabled: vi.fn() };
const publicPaymentConfigMock = { findEnabled: vi.fn() };
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicDeliveryConfig: publicDeliveryConfigMock,
    publicPickupPoints: publicPickupPointsMock,
    publicPaymentConfig: publicPaymentConfigMock,
  },
}));

const { checkoutApi } = await import("./checkout.api");

afterEach(() => {
  apiFetch.mockReset();
  publicDeliveryConfigMock.findEnabled.mockReset();
  publicPickupPointsMock.findEnabled.mockReset();
  publicPaymentConfigMock.findEnabled.mockReset();
});

test("getDeliveryOptions fetches all three public config endpoints for the slug", async () => {
  publicDeliveryConfigMock.findEnabled.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  publicPickupPointsMock.findEnabled.mockResolvedValue([
    { id: "p1", label: "Main", enabled: true },
  ]);
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
  expect(result.paymentMethods).toHaveLength(1);
});

test("submit POSTs the checkout payload, omitting empty optional fields", async () => {
  apiFetch.mockResolvedValue({ order: { id: "o1" }, whatsappUrl: null });

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

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/my-store/checkout",
    {
      method: "POST",
      body: JSON.stringify({
        deliveryMethodType: "COURIER",
        pickupPointId: undefined,
        customerName: undefined,
        customerPhone: "+51999999999",
        customerEmail: undefined,
        items: [{ productId: "p1", variantId: undefined, quantity: 2 }],
      }),
    },
    undefined,
  );
  expect(result.order.id).toBe("o1");
  expect(result.whatsappUrl).toBeNull();
});

test("submit throws when the response fails schema validation", async () => {
  apiFetch.mockResolvedValue({ order: { id: "o1" } });

  await expect(
    checkoutApi.submit("my-store", {
      deliveryMethodType: "COURIER",
      customerPhone: "+51999999999",
      items: [],
    }),
  ).rejects.toThrow();
});
