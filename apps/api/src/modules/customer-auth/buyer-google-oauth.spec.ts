import { vi } from 'vitest';
import {
  createBuyerGoogleState,
  exchangeBuyerGoogleCode,
  verifyBuyerGoogleState,
} from './buyer-google-oauth.js';

function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.sig`;
}

function fetchReturning(body: unknown, ok = true): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('buyer google oauth', () => {
  beforeEach(() => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = 'test-secret';
    process.env.BETTER_AUTH_URL = 'https://api.example.com';
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  });

  describe('state', () => {
    it('round-trips slug and locale when the nonce cookie matches', () => {
      const { state, nonce } = createBuyerGoogleState('my-store', 'en', 1000);

      expect(verifyBuyerGoogleState(state, nonce, 2000)).toMatchObject({
        slug: 'my-store',
        locale: 'en',
        nonce,
      });
    });

    it('rejects a nonce cookie from a different browser', () => {
      const { state } = createBuyerGoogleState('my-store', 'es');

      expect(verifyBuyerGoogleState(state, 'other-nonce')).toBeNull();
    });

    it('rejects a missing cookie, a tampered payload and an expired state', () => {
      const { state, nonce } = createBuyerGoogleState('my-store', 'es', 1000);
      const [payload, signature] = state.split('.');
      const forged = Buffer.from(
        JSON.stringify({ slug: 'evil', locale: 'es', nonce, exp: 9e15 }),
      ).toString('base64url');

      expect(verifyBuyerGoogleState(state, undefined)).toBeNull();
      expect(
        verifyBuyerGoogleState(`${forged}.${signature}`, nonce),
      ).toBeNull();
      expect(verifyBuyerGoogleState(`${payload}.bad`, nonce)).toBeNull();
      expect(
        verifyBuyerGoogleState(state, nonce, 1000 + 11 * 60 * 1000),
      ).toBeNull();
    });
  });

  describe('exchangeBuyerGoogleCode', () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const valid = {
      iss: 'https://accounts.google.com',
      aud: 'client-id',
      exp: future,
      email: 'buyer@example.com',
      email_verified: true,
      name: 'Buyer',
    };

    it('returns the verified identity', async () => {
      const fetchImpl = fetchReturning({ id_token: idToken(valid) });

      await expect(exchangeBuyerGoogleCode('code', fetchImpl)).resolves.toEqual(
        { email: 'buyer@example.com', name: 'Buyer' },
      );
    });

    it.each([
      ['unverified email', { ...valid, email_verified: false }],
      ['wrong audience', { ...valid, aud: 'someone-else' }],
      ['wrong issuer', { ...valid, iss: 'https://evil.example' }],
      ['expired token', { ...valid, exp: 1 }],
      ['no email', { ...valid, email: undefined }],
    ])('rejects %s', async (_label, claims) => {
      const fetchImpl = fetchReturning({ id_token: idToken(claims) });

      await expect(
        exchangeBuyerGoogleCode('code', fetchImpl),
      ).resolves.toBeNull();
    });

    it('returns null when Google rejects the code', async () => {
      await expect(
        exchangeBuyerGoogleCode('bad', fetchReturning({}, false)),
      ).resolves.toBeNull();
    });
  });
});
