import { afterEach, describe, expect, it, vi } from 'vitest';

const { initMock } = vi.hoisted(() => ({ initMock: vi.fn() }));

vi.mock('@sentry/node', () => ({
  init: initMock,
  getClient: () => undefined,
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import { captureException, initErrorTracking } from './error-tracking.js';

const ORIGINAL_DSN = process.env.SENTRY_DSN;

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
      expect.objectContaining({ dsn: 'https://example@sentry.test/1' }),
    );
  });
});

describe('captureException', () => {
  it('is a safe no-op without an initialized Sentry client', () => {
    expect(() => captureException(new Error('boom'))).not.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
