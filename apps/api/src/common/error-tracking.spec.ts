import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent, Event } from '@sentry/node';

const { initMock } = vi.hoisted(() => ({ initMock: vi.fn() }));

vi.mock('@sentry/node', () => ({
  init: initMock,
  getClient: () => undefined,
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import {
  captureException,
  initErrorTracking,
  scrubSentryEvent,
} from './error-tracking.js';

const ORIGINAL_DSN = process.env.SENTRY_DSN;
const TOKEN = 'sekret-token';

type TrackedSpan = NonNullable<Event['spans']>[number];

function span(description: string, data: TrackedSpan['data']): TrackedSpan {
  return {
    description,
    data,
    span_id: 'span',
    start_timestamp: 0,
    trace_id: 'trace',
  };
}

function tokenEvent(): ErrorEvent {
  return {
    type: undefined,
    request: {
      url: `https://api.biasmarket.com/api/public/orders/${TOKEN}?token=also-secret`,
      query_string: 'token=also-secret',
    },
    transaction: `GET /api/public/orders/${TOKEN}`,
    contexts: {
      trace: {
        span_id: 'trace-span',
        trace_id: 'trace-id',
        data: {
          'http.target': `/api/public/orders/${TOKEN}?token=also-secret`,
          'http.query': 'token=also-secret',
        },
      },
    },
    tags: {
      url: `https://api.biasmarket.com/api/public/orders/${TOKEN}`,
      'url.full': `/api/Public/Orders/${TOKEN}?x=1`,
      service: 'orders?keep',
    },
    spans: [
      span(`GET /api/PUBLIC/ORDERS/${TOKEN}`, {
        'url.full': `https://api.biasmarket.com/api/public/orders/${TOKEN}?q=1`,
        'http.status_code': 500,
      }),
    ],
  } as ErrorEvent;
}

describe('initErrorTracking', () => {
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

  it('does not init Sentry when SENTRY_DSN is unset', () => {
    delete process.env.SENTRY_DSN;
    initErrorTracking();
    expect(initMock).not.toHaveBeenCalled();
  });

  it('inits Sentry with the configured DSN when set', () => {
    process.env.SENTRY_DSN = 'https://example@sentry.test/1';
    initErrorTracking();
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@sentry.test/1',
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
      'https://api.biasmarket.com/api/public/orders/:token',
    );
    expect(fromTransaction.transaction).toBe('GET /api/public/orders/:token');
    expect(JSON.stringify(fromError)).not.toContain(TOKEN);
    expect(JSON.stringify(fromTransaction)).not.toContain(TOKEN);
  });
});

describe('captureException', () => {
  it('is a safe no-op without an initialized Sentry client', () => {
    expect(() => captureException(new Error('boom'))).not.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('scrubSentryEvent', () => {
  it('replaces the public-order token in the url, transaction, tags, and spans', () => {
    const event = tokenEvent();

    scrubSentryEvent(event);

    expect(event.request?.url).toBe(
      'https://api.biasmarket.com/api/public/orders/:token',
    );
    expect(event.request?.query_string).toBeUndefined();
    expect(event.transaction).toBe('GET /api/public/orders/:token');
    expect(event.tags?.url).toBe(
      'https://api.biasmarket.com/api/public/orders/:token',
    );
    expect(event.tags?.['url.full']).toBe('/api/public/orders/:token');
    expect(event.tags?.service).toBe('orders?keep');
    expect(event.spans?.[0]?.description).toBe('GET /api/public/orders/:token');
    expect(event.spans?.[0]?.data['url.full']).toBe(
      'https://api.biasmarket.com/api/public/orders/:token',
    );
    expect(event.spans?.[0]?.data['http.status_code']).toBe(500);
    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });
});
