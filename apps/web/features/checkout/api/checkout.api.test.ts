import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { checkoutApi } = await import("./checkout.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("getDeliveryOptions fetches both endpoints and validates both responses", async () => {
  apiFetch
    .mockResolvedValueOnce([{ type: "PICKUP", enabled: true, details: {} }])
    .mockResolvedValueOnce([{ id: "p1", label: "Main", enabled: true }]);

  const result = await checkoutApi.getDeliveryOptions("my-store");

  const calledUrls = apiFetch.mock.calls.map((call) => call[0]);
  expect(calledUrls).toContain("/stores/my-store/public/delivery-methods");
  expect(calledUrls).toContain("/stores/my-store/public/pickup-points");
  expect(result.methods).toHaveLength(1);
  expect(result.points).toHaveLength(1);
});

test("submit POSTs the checkout payload, omitting empty optional fields", async () => {
  apiFetch.mockResolvedValue({ order: { id: "o1" }, whatsappUrl: null });

  const result = await checkoutApi.submit("my-store", {
    deliveryMethodType: "COURIER",
    customerPhone: "+51999999999",
    items: [{ productId: "p1", variantId: undefined, quantity: 2, name: "T", price: 10, currency: "PEN" }],
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
