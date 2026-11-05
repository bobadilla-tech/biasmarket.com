import { afterEach, describe, expect, it, vi } from "vitest";
import { PushProcessor } from "./push.processor.js";

describe("PushProcessor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a validated notification payload to Expo", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "ok" } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await new PushProcessor().process({
      id: "job-1",
      data: {
        to: "ExpoPushToken[buyer-device-00000001]",
        title: "Comprobante aprobado",
        body: "El pago fue aprobado.",
        data: { type: "PAYMENT_PROOF_REVIEWED", orderId: "order-1" },
      },
    } as never);

    expect(fetch).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          to: "ExpoPushToken[buyer-device-00000001]",
          title: "Comprobante aprobado",
          body: "El pago fue aprobado.",
          data: { type: "PAYMENT_PROOF_REVIEWED", orderId: "order-1" },
          sound: "default",
        }),
      }),
    );
  });

  it("throws on temporary HTTP errors so BullMQ can retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );

    await expect(
      new PushProcessor().process({
        id: "job-2",
        data: {
          to: "ExpoPushToken[buyer-device-00000001]",
          title: "Comprobante aprobado",
          body: "El pago fue aprobado.",
        },
      } as never),
    ).rejects.toThrow("HTTP 503");
  });

  it("prunes a permanently unregistered token through the internal API", async () => {
    vi.stubEnv("INTERNAL_API_URL", "http://api:3000");
    vi.stubEnv("INTERNAL_JOBS_SECRET", "synthetic-internal-test-secret");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              status: "error",
              details: { error: "DeviceNotRegistered" },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await new PushProcessor().process({
      id: "job-3",
      data: {
        to: "ExpoPushToken[seller-device-00000001]",
        title: "Nuevo comprobante",
        body: "Hay un pago para revisar.",
      },
    } as never);

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://api:3000/internal/device-tokens/prune",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          expoPushToken: "ExpoPushToken[seller-device-00000001]",
        }),
      }),
    );
  });
});
