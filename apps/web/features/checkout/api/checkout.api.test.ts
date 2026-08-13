import { afterEach, expect, test, vi } from "vitest";

const publicDeliveryConfigMock = { findEnabled: vi.fn() };
const publicPickupPointsMock = { findEnabled: vi.fn() };
const publicPaymentConfigMock = { findEnabled: vi.fn() };
const storesMock = { findPublic: vi.fn() };
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicDeliveryConfig: publicDeliveryConfigMock,
    publicPickupPoints: publicPickupPointsMock,
    publicPaymentConfig: publicPaymentConfigMock,
    stores: storesMock,
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { checkoutApi } = await import("./checkout.api");

afterEach(() => {
  publicDeliveryConfigMock.findEnabled.mockReset();
  publicPickupPointsMock.findEnabled.mockReset();
  publicPaymentConfigMock.findEnabled.mockReset();
  storesMock.findPublic.mockReset();
  fetchMock.mockReset();
});

test("getDeliveryOptions fetches all four public config endpoints for the slug", async () => {
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
  storesMock.findPublic.mockResolvedValue({
    paymentInstructions: "Pay at pickup",
  });

  const result = await checkoutApi.getDeliveryOptions("my-store");

  expect(publicDeliveryConfigMock.findEnabled).toHaveBeenCalledWith("my-store");
  expect(publicPickupPointsMock.findEnabled).toHaveBeenCalledWith("my-store");
  expect(publicPaymentConfigMock.findEnabled).toHaveBeenCalledWith("my-store");
  expect(storesMock.findPublic).toHaveBeenCalledWith("my-store");
  expect(result.methods).toHaveLength(1);
  expect(result.points).toHaveLength(1);
  expect(result.weekday).toBe(3);
  expect(result.paymentMethods).toHaveLength(1);
  expect(result.storePaymentInstructions).toBe("Pay at pickup");
});

function okResponse() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        order: { id: "o1" },
        whatsappUrl: null,
      }),
  };
}

test("submit posts a multipart FormData payload to the checkout route", async () => {
  fetchMock.mockResolvedValueOnce(okResponse());

  const result = await checkoutApi.submit("my-store", {
    deliveryMethodType: "COURIER",
    customerPhone: "+51999999999",
    shippingAddress: {
      recipientName: "Jane Doe",
      phone: "+51999999999",
      line1: "Av. Principal 123",
      city: "Lima",
    },
    items: [
      {
        productId: "p1",
        variantId: undefined,
        quantity: 2,
        name: "T",
        price: 10,
        currency: "PEN",
      },
    ],
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://localhost:3000/api/stores/my-store/checkout");
  expect(options.method).toBe("POST");
  expect(options.credentials).toBe("include");
  const body = options.body as FormData;
  expect(body.get("deliveryMethodType")).toBe("COURIER");
  expect(body.get("customerPhone")).toBe("+51999999999");
  expect(body.get("shippingAddress")).toBe(
    JSON.stringify({
      recipientName: "Jane Doe",
      phone: "+51999999999",
      line1: "Av. Principal 123",
      city: "Lima",
    }),
  );
  expect(body.get("items")).toBe(
    JSON.stringify([{ productId: "p1", variantId: undefined, quantity: 2 }]),
  );
  expect(body.has("file")).toBe(false);
  expect(result.order.id).toBe("o1");
  expect(result.whatsappUrl).toBeNull();
});

test("submit appends the proof file for a manual payment method and omits empty optional fields", async () => {
  fetchMock.mockResolvedValueOnce(okResponse());

  const proof = new File(["x"], "proof.png", { type: "image/png" });
  await checkoutApi.submit("my-store", {
    deliveryMethodType: "PICKUP",
    pickupPointId: "point-1",
    paymentMethod: "TRANSFER",
    customerPhone: "+51999999999",
    paymentProof: proof,
    items: [
      {
        productId: "p1",
        variantId: "v1",
        quantity: 1,
        name: "T",
        price: 10,
        currency: "PEN",
      },
    ],
  });

  const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  const body = options.body as FormData;
  expect(body.get("paymentMethod")).toBe("TRANSFER");
  expect(body.get("pickupPointId")).toBe("point-1");
  expect(body.has("pickupDate")).toBe(false);
  expect(body.has("customerName")).toBe(false);
  expect(body.has("customerEmail")).toBe(false);
  expect(body.has("shippingAddress")).toBe(false);
  expect(body.get("file")).toBe(proof);
});

test("submit does not append the proof file for CASH", async () => {
  fetchMock.mockResolvedValueOnce(okResponse());

  await checkoutApi.submit("my-store", {
    deliveryMethodType: "PICKUP",
    paymentMethod: "CASH",
    customerPhone: "+51999999999",
    paymentProof: new File(["x"], "proof.png", { type: "image/png" }),
    items: [
      {
        productId: "p1",
        variantId: undefined,
        quantity: 1,
        name: "T",
        price: 10,
        currency: "PEN",
      },
    ],
  });

  const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  const body = options.body as FormData;
  expect(body.has("file")).toBe(false);
});

test("submit throws with the joined backend validation messages on a non-ok response", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    json: () =>
      Promise.resolve({
        message: ["Adjunta un comprobante de pago", "Máximo 5MB"],
      }),
  });

  await expect(
    checkoutApi.submit("my-store", {
      deliveryMethodType: "PICKUP",
      customerPhone: "+51999999999",
      items: [
        {
          productId: "p1",
          variantId: undefined,
          quantity: 1,
          name: "T",
          price: 10,
          currency: "PEN",
        },
      ],
    }),
  ).rejects.toThrow("Adjunta un comprobante de pago\nMáximo 5MB");
});

test("submit falls back to the fallbackErrorMessage when the response has no message", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    json: () => Promise.resolve(null),
  });

  await expect(
    checkoutApi.submit(
      "my-store",
      {
        deliveryMethodType: "PICKUP",
        customerPhone: "+51999999999",
        items: [
          {
            productId: "p1",
            variantId: undefined,
            quantity: 1,
            name: "T",
            price: 10,
            currency: "PEN",
          },
        ],
      },
      "checkout failed",
    ),
  ).rejects.toThrow("checkout failed");
});
