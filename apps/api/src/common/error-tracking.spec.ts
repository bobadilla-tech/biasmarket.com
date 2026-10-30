import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent, Event } from "@sentry/node";

const { initMock } = vi.hoisted(() => ({ initMock: vi.fn() }));

vi.mock("@sentry/node", () => ({
  init: initMock,
  getClient: () => undefined,
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/node";
import { scrubSentryEvent } from "@biasmarket/utils/sentry-scrub";
import { captureException, initErrorTracking } from "./error-tracking.js";

const ORIGINAL_DSN = process.env.SENTRY_DSN;
const TOKEN = "sekret-token";

type TrackedSpan = NonNullable<Event["spans"]>[number];

function span(description: string, data: TrackedSpan["data"]): TrackedSpan {
  return {
    description,
    data,
    span_id: "span",
    start_timestamp: 0,
    trace_id: "trace",
  };
}

function tokenEvent(): ErrorEvent {
  return {
    type: undefined,
    request: {
      url: `https://api.biasmarket.com/api/public/orders/${TOKEN}?token=also-secret`,
      query_string: "token=also-secret",
      headers: {
        Referer: `https://biasmarket.com/es/store/k/pedido/${TOKEN}?from=whatsapp`,
      },
    },
    exception: {
      values: [{ value: `Failed to process /api/public/orders/${TOKEN}` }],
    },
    extra: { nested: { source: `/api/public/orders/${TOKEN}/payments` } },
    transaction: `GET /api/public/orders/${TOKEN}`,
    contexts: {
      trace: {
        span_id: "trace-span",
        trace_id: "trace-id",
        data: {
          "http.target": `/api/public/orders/${TOKEN}?token=also-secret`,
          "http.query": "token=also-secret",
        },
      },
    },
    tags: {
      url: `https://api.biasmarket.com/api/public/orders/${TOKEN}`,
      "url.full": `/api/Public/Orders/${TOKEN}?x=1`,
      service: "orders?keep",
    },
    spans: [
      span(`GET /api/PUBLIC/ORDERS/${TOKEN}`, {
        "url.full": `https://api.biasmarket.com/api/public/orders/${TOKEN}?q=1`,
        "http.status_code": 500,
      }),
    ],
  } as ErrorEvent;
}

describe("initErrorTracking", () => {
  afterEach(() => {
    // Assigning `undefined` to process.env serializes to the string
    // "undefined" — restore properly by deleting when it was unset.
    if (ORIGINAL_DSN === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = ORIGINAL_DSN;
    }
    vi.clearAllMocks();
  });

  it("does not init Sentry when SENTRY_DSN is unset", () => {
    delete process.env.SENTRY_DSN;
    initErrorTracking();
    expect(initMock).not.toHaveBeenCalled();
  });

  it("inits Sentry with the configured DSN when set", () => {
    process.env.SENTRY_DSN = "https://example@sentry.test/1";
    initErrorTracking();
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://example@sentry.test/1",
        beforeSend: expect.any(Function),
        beforeSendTransaction: expect.any(Function),
      }),
    );

    const options = initMock.mock.calls[0][0] as {
      beforeSend: (event: ErrorEvent) => ErrorEvent;
      beforeSendTransaction: (event: ErrorEvent) => ErrorEvent;
    };
    const fromError = options.beforeSend(tokenEvent());
    const fromTransaction = options.beforeSendTransaction(tokenEvent());
    expect(fromError.request?.url).toBe(
      "https://api.biasmarket.com/api/public/orders/:token",
    );
    expect(fromTransaction.transaction).toBe("GET /api/public/orders/:token");
    expect(JSON.stringify(fromError)).not.toContain(TOKEN);
    expect(JSON.stringify(fromTransaction)).not.toContain(TOKEN);
  });
});

describe("captureException", () => {
  it("is a safe no-op without an initialized Sentry client", () => {
    expect(() => captureException(new Error("boom"))).not.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("scrubSentryEvent", () => {
  it("replaces the public-order token in the url, transaction, tags, and spans", () => {
    const event = tokenEvent();

    scrubSentryEvent(event);

    expect(event.request?.url).toBe(
      "https://api.biasmarket.com/api/public/orders/:token",
    );
    expect(event.request?.query_string).toBeUndefined();
    expect(event.transaction).toBe("GET /api/public/orders/:token");
    expect(event.tags?.url).toBe(
      "https://api.biasmarket.com/api/public/orders/:token",
    );
    expect(event.tags?.["url.full"]).toBe("/api/public/orders/:token");
    expect(event.tags?.service).toBe("orders?keep");
    expect(event.spans?.[0]?.description).toBe("GET /api/public/orders/:token");
    expect(event.spans?.[0]?.data["url.full"]).toBe(
      "https://api.biasmarket.com/api/public/orders/:token",
    );
    expect(event.spans?.[0]?.data["http.status_code"]).toBe(500);
    expect(event.request?.headers?.Referer).toBe(
      "https://biasmarket.com/es/store/k/pedido/:token",
    );
    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });

  it("keeps diagnostic text around both assisted-order path tokens", () => {
    const event = {
      exception: {
        values: [
          {
            value: `Error at /store/k/pedido/${TOKEN} while parsing: unexpected #1 in body`,
          },
          {
            value: `GET /pedido/${TOKEN} failed (status=500) retry?yes`,
          },
          {
            value: `message: see /pedido/${TOKEN}, then /pedido/${TOKEN}/pago`,
          },
          {
            value: `API failed at /public/orders/${TOKEN} while parsing: unexpected #1 in body`,
          },
        ],
      },
    } as ErrorEvent;

    scrubSentryEvent(event);

    expect(event.exception?.values?.map(({ value }) => value)).toEqual([
      "Error at /store/k/pedido/:token while parsing: unexpected #1 in body",
      "GET /pedido/:token failed (status=500) retry?yes",
      "message: see /pedido/:token, then /pedido/:token/pago",
      "API failed at /public/orders/:token while parsing: unexpected #1 in body",
    ]);
    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });

  it("truncates over-depth event data instead of preserving an unsanitized value", () => {
    const deep: Record<string, unknown> = {};
    let current = deep;
    for (let i = 0; i < 12; i += 1) {
      const child: Record<string, unknown> = {};
      current.n = child;
      current = child;
    }
    current.token = TOKEN;
    const event: Event = { extra: { deep } };

    scrubSentryEvent(event);

    expect(JSON.stringify(event)).not.toContain(TOKEN);
    expect(JSON.stringify(event)).toContain("[Truncated]");
  });

  it("does not throw on getter-only properties or walk SDK internals", () => {
    const scope = {};
    Object.defineProperty(scope, "$", { get: () => "live", enumerable: true });
    const event = {
      transaction: "GET /api/health",
      extra: { holder: scope },
      sdkProcessingMetadata: { capturedSpanScope: scope },
    } as unknown as Event;

    expect(() => scrubSentryEvent(event)).not.toThrow();
    expect(event.extra?.holder).toBe(scope);
  });

  it("still scrubs a changed string next to a getter-only property", () => {
    const holder: Record<string, unknown> = {
      url: `/api/public/orders/${TOKEN}`,
    };
    Object.defineProperty(holder, "$", { get: () => "live", enumerable: true });
    const event = { extra: { holder } } as Event;

    scrubSentryEvent(event);

    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });
});

describe("initErrorTracking hooks", () => {
  it("drops the event instead of throwing when scrubbing fails", () => {
    process.env.SENTRY_DSN = "https://key@glitchtip.example/1";
    initMock.mockClear();
    initErrorTracking();
    const { beforeSend } = initMock.mock.calls[0]![0] as {
      beforeSend: (event: Event) => Event | null;
    };
    // A getter-only property whose string must change cannot be written back.
    const holder = {};
    Object.defineProperty(holder, "url", {
      get: () => `/api/public/orders/${TOKEN}`,
      enumerable: true,
    });

    expect(beforeSend({ extra: { holder } } as Event)).toBeNull();
    process.env.SENTRY_DSN = ORIGINAL_DSN;
  });
});
