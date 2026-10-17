import type { Job } from "bullmq";
import { type Mock, vi } from "vitest";
import {
  ASSISTED_IDENTITY_RETENTION_JOB_NAME,
  EXPIRE_ORDERS_JOB_NAME,
  INTERNAL_JOBS_SECRET_HEADER,
} from "@biasmarket/queue";
import { ExpireOrdersProcessor } from "./expire-orders.processor.js";

describe("ExpireOrdersProcessor", () => {
  let processor: ExpireOrdersProcessor;
  let fetchMock: Mock;

  beforeEach(() => {
    process.env.INTERNAL_API_URL = "http://api:3000";
    process.env.INTERNAL_JOBS_SECRET = "test-secret";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    processor = new ExpireOrdersProcessor();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the internal expire-sweep endpoint over the internal network URL with the shared secret", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ cancelled: 3 }),
    });
    const job = { id: "1", name: EXPIRE_ORDERS_JOB_NAME } as Job;

    const result = await processor.process(job);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:3000/internal/orders/expire-sweep",
      {
        method: "POST",
        headers: { [INTERNAL_JOBS_SECRET_HEADER]: "test-secret" },
      },
    );
    expect(result).toEqual({ cancelled: 3 });
  });

  it("throws when the internal endpoint responds with a non-2xx status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    const job = { id: "2", name: EXPIRE_ORDERS_JOB_NAME } as Job;

    await expect(processor.process(job)).rejects.toThrow(/401/);
  });

  it("calls the secret-guarded identity-retention endpoint for its scheduled job", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ anonymized: 2 }),
    });
    const job = { id: "3", name: ASSISTED_IDENTITY_RETENTION_JOB_NAME } as Job;

    const result = await processor.process(job);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:3000/internal/orders/assisted-identity-retention-sweep",
      {
        method: "POST",
        headers: { [INTERNAL_JOBS_SECRET_HEADER]: "test-secret" },
      },
    );
    expect(result).toEqual({ anonymized: 2 });
  });
});
