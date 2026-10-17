import { afterEach, describe, expect, it, vi } from "vitest";
import { configureApiClient } from "@biasmarket/types";
import { fetchPrivatePaymentProof, privatePaymentProofPath } from "./private-payment-proof";

class StubFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL() {
    this.result = "data:image/jpeg;base64,cHJvb2Y=";
    this.onloadend?.();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("private buyer payment proof", () => {
  it("uses the account image stream route rather than the public image URL", () => {
    expect(privatePaymentProofPath("shop", "order/1", "payment 2")).toBe(
      "/stores/shop/account/orders/order%2F1/payments/payment%202/image",
    );
  });

  it("fetches the image with the API client's bearer header and returns a data URI", async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Blob(["proof"])),
    );
    vi.stubGlobal("fetch", request);
    vi.stubGlobal("FileReader", StubFileReader);
    configureApiClient({
      baseUrl: "https://api.example.test/api",
      credentials: "omit",
      getAuthHeader: () => ({ Authorization: "Bearer buyer-token" }),
    });

    const result = await fetchPrivatePaymentProof("shop", "order-1", "payment-1");

    expect(result).toBe("data:image/jpeg;base64,cHJvb2Y=");
    expect(request.mock.calls[0][0]).toBe(
      "https://api.example.test/api/stores/shop/account/orders/order-1/payments/payment-1/image",
    );
    expect(new Headers(request.mock.calls[0][1]?.headers).get("Authorization")).toBe(
      "Bearer buyer-token",
    );
  });
});
