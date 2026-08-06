import { afterEach, expect, test, vi } from "vitest";

const ordersMock = {
  findAll: vi.fn(),
  review: vi.fn(),
  advance: vi.fn(),
  cancel: vi.fn(),
};
vi.mock("@/lib/api-client", () => ({ apiClient: { orders: ordersMock } }));

const { ordersApi } = await import("./orders.api");

afterEach(() => {
  ordersMock.findAll.mockReset();
  ordersMock.review.mockReset();
  ordersMock.advance.mockReset();
  ordersMock.cancel.mockReset();
});

test("review delegates to the generated Order.review with the decision", async () => {
  ordersMock.review.mockResolvedValue({});

  await ordersApi.review("store-1", "o1", "approve");

  expect(ordersMock.review).toHaveBeenCalledWith(
    "store-1",
    "o1",
    { decision: "approve" },
    { fallbackErrorMessage: undefined },
  );
});

test("review includes the reason in the body when rejecting with a reason", async () => {
  ordersMock.review.mockResolvedValue({});

  await ordersApi.review("store-1", "o1", "reject", "Comprobante adulterado");

  expect(ordersMock.review).toHaveBeenCalledWith(
    "store-1",
    "o1",
    { decision: "reject", reason: "Comprobante adulterado" },
    { fallbackErrorMessage: undefined },
  );
});

test("advance delegates to the generated Order.advance with the status", async () => {
  ordersMock.advance.mockResolvedValue({});

  await ordersApi.advance("store-1", "o1", "IN_TRANSIT");

  expect(ordersMock.advance).toHaveBeenCalledWith(
    "store-1",
    "o1",
    { status: "IN_TRANSIT" },
    { fallbackErrorMessage: undefined },
  );
});

test("cancelOrder delegates to the generated Order.cancel", async () => {
  ordersMock.cancel.mockResolvedValue({});

  await ordersApi.cancelOrder("store-1", "o1", { resolution: "RETAINED" });

  expect(ordersMock.cancel).toHaveBeenCalledWith(
    "store-1",
    "o1",
    { resolution: "RETAINED" },
    { fallbackErrorMessage: undefined },
  );
});

test("list delegates to the generated Order.findAll", async () => {
  ordersMock.findAll.mockResolvedValue([]);

  const result = await ordersApi.list("store-1");

  expect(ordersMock.findAll).toHaveBeenCalledWith("store-1", undefined, {
    fallbackErrorMessage: undefined,
  });
  expect(result).toEqual([]);
});
