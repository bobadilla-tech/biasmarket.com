import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  assistedOrdersApi,
  IdempotentReplayError,
} from "./assisted-orders.api";

const payload = { deliveryMethodType: "PICKUP", items: [] } as never;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

test("posts JSON with the Idempotency-Key header and the session cookie", async () => {
  fetchMock.mockResolvedValue(reply(201, { order: { id: "o1" } }));

  const result = await assistedOrdersApi.create("store-1", payload, "key-1");

  expect(result).toEqual({ order: { id: "o1" } });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toMatch(/\/api\/stores\/store-1\/orders\/assisted$/);
  expect(init.method).toBe("POST");
  expect(init.credentials).toBe("include");
  expect(init.headers).toMatchObject({
    "Content-Type": "application/json",
    "Idempotency-Key": "key-1",
  });
  expect(JSON.parse(init.body)).toEqual(payload);
});

test("turns an IDEMPOTENT_REPLAY 409 into a typed error carrying the order id", async () => {
  fetchMock.mockResolvedValue(
    reply(409, {
      statusCode: 409,
      code: "IDEMPOTENT_REPLAY",
      orderId: "order-9",
      message: "Este pedido ya fue creado con esta clave",
    }),
  );

  const err = await assistedOrdersApi
    .create("store-1", payload, "key-1")
    .catch((e: unknown) => e);

  expect(err).toBeInstanceOf(IdempotentReplayError);
  expect((err as IdempotentReplayError).orderId).toBe("order-9");
});

test("throws the server message for other errors, including other 409s", async () => {
  fetchMock.mockResolvedValue(reply(409, { message: "Otro conflicto" }));
  await expect(
    assistedOrdersApi.create("store-1", payload, "key-1"),
  ).rejects.toThrow("Otro conflicto");

  fetchMock.mockResolvedValue(new Response("not json", { status: 502 }));
  await expect(
    assistedOrdersApi.create("store-1", payload, "key-1"),
  ).rejects.toThrow("Network error");
});
