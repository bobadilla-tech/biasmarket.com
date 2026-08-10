import type { Job } from "bullmq";
import { type Mock, vi } from "vitest";
import type { SendEmailParams } from "@biasmarket/queue";
import { MailerProcessor } from "./mailer.processor.js";

describe("MailerProcessor", () => {
  it("sends a valid payload via MailerCore", async () => {
    const processor = new MailerProcessor();
    const core = { send: vi.fn().mockResolvedValue({ id: "resend-1" }) };
    // Overrides the private MailerCore instance so this test never touches
    // the real Resend client or the dev file-writer.
    (processor as unknown as { core: typeof core }).core = core;
    const job = {
      id: "1",
      data: { to: "a@b.com", subject: "Hi", html: "<p>hi</p>" },
    } as Job<SendEmailParams>;

    const result = await processor.process(job);

    expect(core.send).toHaveBeenCalledWith(job.data);
    expect(result).toEqual({ id: "resend-1" });
  });

  it("rejects a payload that fails schema validation", async () => {
    const processor = new MailerProcessor();
    const job = { id: "2", data: {} } as Job<SendEmailParams>;

    await expect(processor.process(job)).rejects.toThrow();
  });
});
