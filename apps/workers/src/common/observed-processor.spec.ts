import { Processor, WorkerHost } from "@nestjs/bullmq";
import { MetadataScanner } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";
import { Writable } from "node:stream";
import { Logger, LoggerModule } from "nestjs-pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLoggerParams } from "./logging/logger.config.js";

const { captureJobError } = vi.hoisted(() => ({ captureJobError: vi.fn() }));
vi.mock("./error-tracking.js", () => ({ captureJobError }));

import { ObservedProcessor } from "./observed-processor.js";

class SampleProcessor extends ObservedProcessor {
  async process(): Promise<void> {}
}

function job(partial: Partial<Job> & { attemptsMade: number }): Job {
  return {
    id: "42",
    name: "expire-orders",
    queueName: "orders",
    opts: { attempts: 3 },
    ...partial,
  } as unknown as Job;
}

describe("ObservedProcessor", () => {
  let raw: string;
  let processor: SampleProcessor;

  beforeEach(async () => {
    raw = "";
    captureJobError.mockClear();
    const sink = new Writable({
      write(chunk, _encoding, done) {
        raw += String(chunk);
        done();
      },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot(buildLoggerParams(sink))],
      providers: [SampleProcessor],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    await app.init();
    processor = app.get(SampleProcessor);
    raw = "";
  });

  const lines = () =>
    raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  it("is found by the BullMQ explorer on a subclass (prototype-chain scan)", () => {
    const names = new MetadataScanner().getAllMethodNames(
      Object.getPrototypeOf(processor),
    );
    expect(names).toEqual(
      expect.arrayContaining(["onFailed", "onWorkerError"]),
    );
  });

  it("logs a retryable failure as a warning and does not report it", () => {
    processor.onFailed(job({ attemptsMade: 1 }), new Error("api down"));

    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({
      level: 40,
      service: "workers",
      queue: "orders",
      job: "expire-orders",
      jobId: "42",
      attemptsMade: 1,
      attempts: 3,
    });
    expect(captureJobError).not.toHaveBeenCalled();
  });

  it("logs the final failure as an error and reports it once", () => {
    const error = new Error("api down");
    processor.onFailed(job({ attemptsMade: 3 }), error);

    expect(lines()[0]).toMatchObject({
      level: 50,
      queue: "orders",
      jobId: "42",
      attemptsMade: 3,
    });
    // One `msg`, and the stack is a structured field, not folded into `msg`.
    expect(raw.match(/"msg"/g)).toHaveLength(1);
    expect(lines()[0]!.err).toMatchObject({
      message: "api down",
      stack: expect.stringContaining("api down"),
    });
    expect(captureJobError).toHaveBeenCalledTimes(1);
    expect(captureJobError).toHaveBeenCalledWith(error, {
      queue: "orders",
      job: "expire-orders",
      jobId: "42",
    });
  });

  it("treats a job without retry options as a single attempt", () => {
    processor.onFailed(
      job({ attemptsMade: 1, opts: {} } as Partial<Job> & {
        attemptsMade: number;
      }),
      new Error("boom"),
    );
    expect(captureJobError).toHaveBeenCalledTimes(1);
  });

  it("copes with a failed event that carries no job", () => {
    expect(() =>
      processor.onFailed(undefined, new Error("gone")),
    ).not.toThrow();
    expect(captureJobError).toHaveBeenCalledWith(expect.any(Error), {
      queue: "unknown",
      job: "unknown",
      jobId: undefined,
    });
  });

  it("logs a worker-level error such as a lost Redis connection", () => {
    processor.onWorkerError(new Error("connect ECONNREFUSED"));
    expect(lines()[0]).toMatchObject({ level: 50 });
    expect(raw.match(/"msg"/g)).toHaveLength(1);
    expect(raw).toContain("connect ECONNREFUSED");
  });
});

// Keeps the unused-import guard honest: the base class must stay a WorkerHost.
describe("class shape", () => {
  it("extends WorkerHost so @Processor classes keep working", () => {
    expect(Object.getPrototypeOf(ObservedProcessor)).toBe(WorkerHost);
    expect(typeof Processor).toBe("function");
  });
});
