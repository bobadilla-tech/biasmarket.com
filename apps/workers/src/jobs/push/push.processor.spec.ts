import { afterEach, describe, expect, it, vi } from "vitest";
import { PushProcessor } from "./push.processor.js";

describe("PushProcessor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a validated payload to Expo and rejects failed delivery responses", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "ok" } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const processor = new PushProcessor();
    await processor.process({
      data: {
        to: "ExponentPushToken[device]",
        title: "Pago aprobado",
        body: "Listo",
      },
      id: "job-1",
    } as never);
    expect(fetch).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({ method: "POST" }),
    );

    fetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await expect(
      processor.process({
        data: {
          to: "ExponentPushToken[device]",
          title: "Pago aprobado",
          body: "Listo",
        },
        id: "job-2",
      } as never),
    ).rejects.toThrow("HTTP 503");
  });

  it("prunes tokens Expo reports as unregistered without retrying the push", async () => {
    const previousApiUrl = process.env.INTERNAL_API_URL;
    const previousSecret = process.env.INTERNAL_JOBS_SECRET;
    process.env.INTERNAL_API_URL = "http://api:3000";
    process.env.INTERNAL_JOBS_SECRET = "internal-test-secret";
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

    try {
      await new PushProcessor().process({
        data: {
          to: "ExpoPushToken[device]",
          title: "Pago aprobado",
          body: "Listo",
        },
        id: "job-prune",
      } as never);

      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "http://api:3000/internal/device-tokens/prune",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ expoPushToken: "ExpoPushToken[device]" }),
        }),
      );
    } finally {
      if (previousApiUrl === undefined) delete process.env.INTERNAL_API_URL;
      else process.env.INTERNAL_API_URL = previousApiUrl;
      if (previousSecret === undefined) delete process.env.INTERNAL_JOBS_SECRET;
      else process.env.INTERNAL_JOBS_SECRET = previousSecret;
    }
  });
});
