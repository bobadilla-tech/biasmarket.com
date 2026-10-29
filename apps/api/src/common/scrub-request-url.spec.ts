import { scrubRequestUrl } from './scrub-request-url.js';
import { scrubSentryEvent } from './error-tracking.js';

describe('scrubRequestUrl for the proof upload routes', () => {
  const TOKEN = 'tok_SECRET-123';

  it.each([
    [
      `/api/public/orders/${TOKEN}/payments`,
      '/api/public/orders/:token/payments',
    ],
    [
      `/api/public/orders/${TOKEN}/payments/pay_1/image`,
      '/api/public/orders/:token/payments/pay_1/image',
    ],
    [
      `/API/PUBLIC/ORDERS/${TOKEN}/payments/pay_1/image?x=1`,
      '/API/PUBLIC/ORDERS/:token/payments/pay_1/image',
    ],
  ])('scrubs %s', (input, expected) => {
    const out = scrubRequestUrl(input);
    expect(out.toLowerCase()).toBe(expected.toLowerCase());
    expect(out).not.toContain(TOKEN);
  });

  it('scrubs the token out of a Sentry event for the upload route', () => {
    const event = {
      request: {
        url: `https://api.biasmarket.com/api/public/orders/${TOKEN}/payments`,
      },
      transaction: `POST /api/public/orders/${TOKEN}/payments`,
    } as never;
    scrubSentryEvent(event);
    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });
});
