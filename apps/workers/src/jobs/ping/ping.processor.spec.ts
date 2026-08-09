import type { Job } from "bullmq";
import type { PingJobPayload } from "@biasmarket/queue";
import { PingProcessor } from "./ping.processor.js";

describe("PingProcessor", () => {
  it("echoes back a pong for a valid payload", async () => {
    const processor = new PingProcessor();
    const job = { id: "1", data: { message: "hello" } } as Job<PingJobPayload>;

    const result = await processor.process(job);

    expect(result.pong).toBe(true);
    expect(typeof result.receivedAt).toBe("string");
  });

  it("rejects a payload that fails schema validation", async () => {
    const processor = new PingProcessor();
    const job = { id: "2", data: {} } as Job<PingJobPayload>;

    await expect(processor.process(job)).rejects.toThrow();
  });
});
