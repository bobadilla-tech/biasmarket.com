import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { voidPayment } = vi.hoisted(() => ({ voidPayment: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient: { orders: { voidPayment } } }));

const { ordersApi, DuplicateOperationCodeError } = await import("./orders.api");

const fetchMock = vi.fn();
const values = {
  amount: "40.00",
  method: "YAPE",
  operationCode: " OP-1 ",
  paidAt: "2026-10-01",
  note: "hola",
  file: new File(["x"], "capture.png", { type: "image/png" }),
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  process.env.INTERNAL_API_URL = "https://api.example.com";
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  voidPayment.mockReset();
});

test("sends the code, noon-Lima paidAt and the capture with the seller cookie", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ id: "o1" }),
  });
  await ordersApi.registerPayment("s1", "o1", values);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("https://api.example.com/api/stores/s1/orders/o1/payments");
  expect(init.credentials).toBe("include");
  const body = init.body as FormData;
  expect(body.get("amount")).toBe("40.00");
  expect(body.get("method")).toBe("YAPE");
  expect(body.get("operationCode")).toBe("OP-1");
  expect(body.get("paidAt")).toBe("2026-10-01T12:00:00-05:00");
  expect(body.get("note")).toBe("hola");
  expect(body.get("file")).toBeInstanceOf(File);
  expect(body.has("confirmDuplicate")).toBe(false);
});

test("omits an empty code and adds confirmDuplicate on the confirmed retry", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({}),
  });
  await ordersApi.registerPayment(
    "s1",
    "o1",
    { ...values, operationCode: "  " },
    { confirmDuplicate: true },
  );
  const body = fetchMock.mock.calls[0]![1].body as FormData;
  expect(body.has("operationCode")).toBe(false);
  expect(body.get("confirmDuplicate")).toBe("true");
});

test("turns the 409 body into a typed DuplicateOperationCodeError", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ code: "DUPLICATE_OPERATION_CODE", orderId: "other" }),
  });
  const error = await ordersApi
    .registerPayment("s1", "o1", values)
    .catch((e) => e);
  expect(error).toBeInstanceOf(DuplicateOperationCodeError);
  expect(error.orderId).toBe("other");
});

test("any other failure keeps the API message, then the fallback", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ message: "Adjunta la captura del pago" }),
  });
  await expect(ordersApi.registerPayment("s1", "o1", values)).rejects.toThrow(
    "Adjunta la captura del pago",
  );
  fetchMock.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error("no json");
    },
  });
  await expect(
    ordersApi.registerPayment("s1", "o1", values, {
      fallbackErrorMessage: "fallback",
    }),
  ).rejects.toThrow("fallback");
});

test("a 409 without the duplicate body is a plain error", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ message: "otro conflicto" }),
  });
  const error = await ordersApi
    .registerPayment("s1", "o1", values)
    .catch((e) => e);
  expect(error).not.toBeInstanceOf(DuplicateOperationCodeError);
  expect(error.message).toBe("otro conflicto");
});

test("voids through the generated client with the reason", async () => {
  voidPayment.mockResolvedValue({});
  await ordersApi.voidPayment("s1", "o1", "p1", "pago duplicado", "fallback");
  expect(voidPayment).toHaveBeenCalledWith(
    "s1",
    "o1",
    "p1",
    { reason: "pago duplicado" },
    { fallbackErrorMessage: "fallback" },
  );
});
