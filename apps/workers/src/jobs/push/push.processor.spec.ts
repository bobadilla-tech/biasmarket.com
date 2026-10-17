import { afterEach, describe, expect, it, vi } from "vitest";
import { PushProcessor } from "./push.processor.js";

describe("PushProcessor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a validated payload to Expo and rejects failed delivery responses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
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
});
