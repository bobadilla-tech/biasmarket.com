import { afterEach, describe, expect, it, vi } from "vitest";

const { initMock, pinoIntegrationMock, captureExceptionMock, getClientMock } =
  vi.hoisted(() => ({
    initMock: vi.fn(),
    pinoIntegrationMock: vi.fn(() => ({ name: "Pino" })),
    captureExceptionMock: vi.fn(),
    getClientMock: vi.fn(),
  }));

vi.mock("@sentry/node", () => ({
  init: initMock,
  pinoIntegration: pinoIntegrationMock,
  captureException: captureExceptionMock,
  getClient: getClientMock,
}));

import { captureJobError, initErrorTracking } from "./error-tracking.js";

const ORIGINAL_DSN = process.env.SENTRY_DSN;
const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc";

afterEach(() => {
  initMock.mockClear();
  captureExceptionMock.mockClear();
  getClientMock.mockReset();
  if (ORIGINAL_DSN === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = ORIGINAL_DSN;
});

describe("initErrorTracking", () => {
  it("does nothing without a DSN", () => {
    delete process.env.SENTRY_DSN;
    initErrorTracking();
    expect(initMock).not.toHaveBeenCalled();
  });

  it("initialises with logs on, the workers tag, and no pino issues", () => {
    process.env.SENTRY_DSN = "https://example@sentry.test/1";
    initErrorTracking();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://example@sentry.test/1",
        enableLogs: true,
        initialScope: { tags: { service: "workers" } },
      }),
    );
    expect(pinoIntegrationMock).toHaveBeenCalledWith({
      log: { levels: ["info", "warn", "error", "fatal"] },
      error: { levels: [] },
    });
  });

  it("scrubs forwarded logs and drops Nest boot lines", () => {
    process.env.SENTRY_DSN = "https://example@sentry.test/1";
    initErrorTracking();
    const { beforeSendLog } = initMock.mock.calls[0]![0] as {
      beforeSendLog: (log: object) => object | null;
    };

    expect(
      beforeSendLog({
        message: "x",
        attributes: { context: "InstanceLoader" },
      }),
    ).toBeNull();
    const scrubbed = beforeSendLog({
      message: `called /public/orders/${TOKEN}/payments`,
      attributes: { context: "ExpireOrdersProcessor" },
    });
    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
  });
});

describe("captureJobError", () => {
  const context = { queue: "orders", job: "expire-orders", jobId: "42" };

  it("is a no-op without an initialised client", () => {
    getClientMock.mockReturnValue(undefined);
    captureJobError(new Error("x"), context);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("reports with the queue and job as tags", () => {
    getClientMock.mockReturnValue({});
    const error = new Error("x");
    captureJobError(error, context);
    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { queue: "orders", job: "expire-orders" },
      extra: { jobId: "42" },
    });
  });
});
