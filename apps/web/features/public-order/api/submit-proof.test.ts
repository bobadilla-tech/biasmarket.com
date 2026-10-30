import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "@biasmarket/types";
import { submitProof } from "./submit-proof";

const fetchMock = vi.fn();
const values = {
  amount: "30.00",
  method: "YAPE" as const,
  operationCode: " OP-1 ",
  file: new File(["x"], "proof.png", { type: "image/png" }),
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  delete process.env.NEXT_PUBLIC_API_URL;
});

test("posts multipart to the browser API base without cookies or custom headers", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "p1" }) });
  await expect(submitProof("tok/1", values)).resolves.toEqual({ id: "p1" });

  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe(
    "https://api.example.com/api/public/orders/tok%2F1/payments",
  );
  expect(init.method).toBe("POST");
  expect(init.credentials).toBe("omit");
  // A header here would force a CORS preflight that the API rejects.
  expect(init.headers).toBeUndefined();
  const body = init.body as FormData;
  expect(body.get("amount")).toBe("30.00");
  expect(body.get("method")).toBe("YAPE");
  expect(body.get("operationCode")).toBe("OP-1");
  expect(body.get("file")).toBeInstanceOf(File);
});

test("uses a same-origin relative URL when no API base is configured", async () => {
  delete process.env.NEXT_PUBLIC_API_URL;
  delete process.env.INTERNAL_API_URL;
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "p1" }) });
  await submitProof("tok", values);
  expect(fetchMock.mock.calls[0]![0]).toBe("/api/public/orders/tok/payments");
});

test("omits an empty operation code", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "p1" }) });
  await submitProof("tok", { ...values, operationCode: "  " });
  expect(
    (fetchMock.mock.calls[0]![1].body as FormData).has("operationCode"),
  ).toBe(false);
});

test.each([404, 413, 429, 400])(
  "throws an ApiError carrying status %i",
  async (status) => {
    fetchMock.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ message: "El monto excede el saldo pendiente" }),
    });
    const error = await submitProof("tok", values).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(status);
    expect(error.message).toBe("El monto excede el saldo pendiente");
  },
);

test("falls back to the given message when the body is not JSON", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error("not json");
    },
  });
  await expect(submitProof("tok", values, "fallback")).rejects.toMatchObject({
    message: "fallback",
    status: 500,
  });
});
