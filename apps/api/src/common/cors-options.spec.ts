import { buildCorsOptions, CORS_ALLOWED_HEADERS } from './cors-options.js';

describe('buildCorsOptions', () => {
  it('lets the browser send Idempotency-Key (otherwise the preflight rejects assisted-order creation)', () => {
    expect(CORS_ALLOWED_HEADERS).toContain('Idempotency-Key');
    expect(buildCorsOptions().allowedHeaders).toEqual(
      expect.arrayContaining([
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
      ]),
    );
  });

  it('keeps credentials and the WEB_URL origin', () => {
    process.env.WEB_URL = 'https://biasmarket.com';
    expect(buildCorsOptions()).toMatchObject({
      origin: 'https://biasmarket.com',
      credentials: true,
    });
  });
});
