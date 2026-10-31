import { type Mock, vi } from "vitest";
import type { Queue } from "bullmq";
import { MAILER_JOB_NAME } from "@biasmarket/queue";
import { MailerService } from "./mailer.service.js";

describe("MailerService", () => {
  let queue: { add: Mock };
  let service: MailerService;

  beforeEach(() => {
    queue = { add: vi.fn().mockResolvedValue({ id: "job-1" }) };
    service = new MailerService(queue as unknown as Queue);
  });

  it("enqueues the validated payload and maps the BullMQ job id into { id }", async () => {
    const params = {
      to: "buyer@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
    };

    const result = await service.send(params);

    expect(queue.add).toHaveBeenCalledWith(MAILER_JOB_NAME, params);
    expect(result).toEqual({ id: "job-1" });
  });

  it("rejects an invalid payload before enqueueing (fail the enqueue loudly)", async () => {
    await expect(
      service.send({ to: "", subject: "Hi", html: "<p>hi</p>" }),
    ).rejects.toThrow();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
