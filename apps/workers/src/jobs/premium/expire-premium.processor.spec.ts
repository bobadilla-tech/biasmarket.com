import type { Job } from "bullmq";
import { type Mock, vi } from "vitest";
import { INTERNAL_JOBS_SECRET_HEADER } from "@biasmarket/queue";
import { ExpirePremiumProcessor } from "./expire-premium.processor.js";

describe("ExpirePremiumProcessor", () => {
  let processor: ExpirePremiumProcessor;
  let fetchMock: Mock;

  beforeEach(() => {
    process.env.INTERNAL_API_URL = "http://api:3000";
    process.env.INTERNAL_JOBS_SECRET = "test-secret";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    processor = new ExpirePremiumProcessor();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the internal expire-sweep endpoint over the internal network URL with the shared secret", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ expired: 5 }),
    });
    const job = { id: "1" } as Job;

    const result = await processor.process(job);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:3000/internal/premium/expire-sweep",
      {
        method: "POST",
        headers: { [INTERNAL_JOBS_SECRET_HEADER]: "test-secret" },
      },
    );
    expect(result).toEqual({ expired: 5 });
  });

  it("throws when the internal endpoint responds with a non-2xx status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    const job = { id: "2" } as Job;

    await expect(processor.process(job)).rejects.toThrow(/401/);
  });
});
