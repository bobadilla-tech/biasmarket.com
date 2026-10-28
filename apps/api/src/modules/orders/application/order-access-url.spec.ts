import { buildOrderAccessUrl } from './order-access-url.js';

describe('buildOrderAccessUrl', () => {
  const original = process.env.WEB_URL;
  afterEach(() => {
    process.env.WEB_URL = original;
  });

  it('puts the token in the path, never in a query string', () => {
    process.env.WEB_URL = 'https://biasmarket.com/';
    expect(buildOrderAccessUrl('tok_-123', 'mi-tienda')).toBe(
      'https://biasmarket.com/es/store/mi-tienda/pedido/tok_-123',
    );
  });

  it('throws when WEB_URL is missing', () => {
    delete process.env.WEB_URL;
    expect(() => buildOrderAccessUrl('t', 's')).toThrow(/WEB_URL/);
  });
});
