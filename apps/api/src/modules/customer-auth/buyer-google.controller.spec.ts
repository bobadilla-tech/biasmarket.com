import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { type Mock, vi } from 'vitest';
import { BuyerGoogleController } from './buyer-google.controller.js';
import {
  ClaimOrderError,
  CustomerAuthService,
} from './customer-auth.service.js';
import {
  BUYER_GOOGLE_STATE_COOKIE,
  createBuyerGoogleState,
} from './buyer-google-oauth.js';
import { CLAIM_TICKET_COOKIE, signClaimTicket } from './claim-ticket.js';
import { CUSTOMER_SESSION_COOKIE } from './customer-session.constants.js';

const exchange = vi.hoisted(() => vi.fn());
vi.mock('./buyer-google-oauth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./buyer-google-oauth.js')>()),
  exchangeBuyerGoogleCode: exchange,
}));

describe('BuyerGoogleController claim flow', () => {
  let app: INestApplication;
  let auth: {
    assertStoreExists: Mock;
    loginWithGoogle: Mock;
    claimWithGoogle: Mock;
  };
  const identity = { sub: 's', email: 'b@example.com', name: 'B' };
  const ticket = () =>
    signClaimTicket({ orderId: 'order-1', accessTokenHash: 'a'.repeat(64) });

  beforeEach(async () => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = 'test-secret';
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.WEB_URL = 'http://localhost:3001';
    exchange.mockReset();
    auth = {
      assertStoreExists: vi.fn(),
      loginWithGoogle: vi.fn().mockResolvedValue('login-token'),
      claimWithGoogle: vi
        .fn()
        .mockResolvedValue({ token: 'claim-token', orderId: 'order-1' }),
    };
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [BuyerGoogleController],
      providers: [{ provide: CustomerAuthService, useValue: auth }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterEach(() => app.close());

  const cookies = (res: request.Response) =>
    ((res.headers['set-cookie'] as unknown as string[]) ?? []).join('\n');

  describe('start (global, claim=1)', () => {
    it('sends the buyer to Google only when the ticket cookie verifies, with a boolean in state', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/account/google?claim=1&locale=en')
        .set('Cookie', `${CLAIM_TICKET_COOKIE}=${ticket()}`)
        .expect(302);

      const location = new URL(res.headers.location!);
      expect(location.origin).toBe('https://accounts.google.com');
      expect(location.searchParams.get('scope')).toBe('openid email profile');
      const state = location.searchParams.get('state')!;
      const body = JSON.parse(
        Buffer.from(state.split('.')[0]!, 'base64url').toString(),
      );
      expect(body.claim).toBe(true);
      // Nothing about the order anywhere in the URL.
      expect(res.headers.location).not.toMatch(/order-1|aaaaaaaa/);
    });

    it.each([
      ['no cookie', undefined],
      ['a forged cookie', `${CLAIM_TICKET_COOKIE}=forged.ticket`],
    ])(
      'redirects with claim=invalid for %s, before Google',
      async (_l, cookie) => {
        const req = request(app.getHttpServer()).get(
          '/api/account/google?claim=1&locale=es',
        );
        if (cookie) req.set('Cookie', cookie);
        const res = await req.expect(302);
        expect(res.headers.location).toBe(
          'http://localhost:3001/es/my-purchases?claim=invalid',
        );
      },
    );

    it('redirects with claim=unavailable when Google is not configured', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      const res = await request(app.getHttpServer())
        .get('/api/account/google?claim=1')
        .set('Cookie', `${CLAIM_TICKET_COOKIE}=${ticket()}`)
        .expect(302);
      expect(res.headers.location).toContain('claim=unavailable');
    });

    it('a plain login start (no claim) still works without a ticket', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/account/google')
        .expect(302);
      expect(res.headers.location).toContain('accounts.google.com');
      const body = JSON.parse(
        Buffer.from(
          new URL(res.headers.location!).searchParams
            .get('state')!
            .split('.')[0]!,
          'base64url',
        ).toString(),
      );
      expect(body.claim).toBe(false);
    });
  });

  describe('callback', () => {
    const start = (claim: boolean) =>
      createBuyerGoogleState(null, 'es', Date.now(), claim);
    const call = (
      state: string,
      nonce: string,
      extra: string[] = [],
      code: string | undefined = 'google-code',
    ) =>
      request(app.getHttpServer())
        .get(
          `/api/account/google/callback?${code ? `code=${code}&` : ''}state=${encodeURIComponent(
            state,
          )}`,
        )
        .set('Cookie', [`${BUYER_GOOGLE_STATE_COOKIE}=${nonce}`, ...extra]);

    it('claims, replaces the session and lands on Mi cuenta, clearing both cookies', async () => {
      exchange.mockResolvedValue(identity);
      const { state, nonce } = start(true);

      const res = await call(state, nonce, [
        `${CLAIM_TICKET_COOKIE}=${ticket()}`,
        `${CUSTOMER_SESSION_COOKIE}=another-buyers-session`,
      ]).expect(302);

      expect(res.headers.location).toBe(
        'http://localhost:3001/es/my-purchases/orders/order-1?claimed=1',
      );
      expect(auth.claimWithGoogle).toHaveBeenCalledWith(identity, {
        orderId: 'order-1',
        linkFp: 'a'.repeat(16),
        exp: expect.any(Number),
      });
      expect(auth.loginWithGoogle).not.toHaveBeenCalled();
      const set = cookies(res);
      expect(set).toContain(`${CUSTOMER_SESSION_COOKIE}=claim-token`);
      expect(set).not.toContain('another-buyers-session');
      expect(set).toMatch(
        new RegExp(`${CLAIM_TICKET_COOKIE}=;.*Path=/api/account/google`),
      );
      expect(set).toMatch(new RegExp(`${BUYER_GOOGLE_STATE_COOKIE}=;`));
    });

    it('needs BOTH the state flag and the ticket: a flagged state without a ticket is invalid', async () => {
      const { state, nonce } = start(true);
      const res = await call(state, nonce).expect(302);
      expect(res.headers.location).toContain('claim=invalid');
      expect(auth.claimWithGoogle).not.toHaveBeenCalled();
      expect(exchange).not.toHaveBeenCalled();
    });

    it('ignores a ticket cookie when the state is not a claim: plain login, cookie cleared', async () => {
      exchange.mockResolvedValue(identity);
      const { state, nonce } = start(false);

      const res = await call(state, nonce, [
        `${CLAIM_TICKET_COOKIE}=${ticket()}`,
      ]).expect(302);

      expect(auth.claimWithGoogle).not.toHaveBeenCalled();
      expect(auth.loginWithGoogle).toHaveBeenCalledWith(null, identity);
      expect(cookies(res)).toMatch(new RegExp(`${CLAIM_TICKET_COOKIE}=;`));
    });

    it.each([['already_claimed'], ['not_claimable'], ['invalid']] as const)(
      'maps a %s refusal to ?claim=%s',
      async (code) => {
        exchange.mockResolvedValue(identity);
        auth.claimWithGoogle.mockRejectedValue(new ClaimOrderError(code));
        const { state, nonce } = start(true);

        const res = await call(state, nonce, [
          `${CLAIM_TICKET_COOKIE}=${ticket()}`,
        ]).expect(302);

        expect(res.headers.location).toBe(
          `http://localhost:3001/es/my-purchases?claim=${code}`,
        );
        expect(cookies(res)).not.toContain(`${CUSTOMER_SESSION_COOKIE}=`);
      },
    );

    it('answers failed for an unexpected error, a rejected exchange and a missing code, never echoing them', async () => {
      const { state, nonce } = start(true);
      const withTicket = [`${CLAIM_TICKET_COOKIE}=${ticket()}`];

      exchange.mockResolvedValue(null);
      let res = await call(state, nonce, withTicket).expect(302);
      expect(res.headers.location).toContain('claim=failed');

      exchange.mockResolvedValue(identity);
      auth.claimWithGoogle.mockRejectedValue(new Error('db password=hunter2'));
      res = await call(state, nonce, withTicket).expect(302);
      expect(res.headers.location).toContain('claim=failed');
      expect(res.headers.location).not.toContain('hunter2');

      res = await call(state, nonce, withTicket, undefined).expect(302);
      expect(res.headers.location).toContain('claim=failed');
      // Every branch still cleared both single-use cookies.
      expect(cookies(res)).toMatch(new RegExp(`${CLAIM_TICKET_COOKIE}=;`));
    });

    it('clears both cookies even when the state does not verify', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/account/google/callback?code=x&state=bad.state')
        .set('Cookie', `${CLAIM_TICKET_COOKIE}=${ticket()}`)
        .expect(302);
      expect(res.headers.location).toBe('http://localhost:3001');
      expect(cookies(res)).toMatch(new RegExp(`${CLAIM_TICKET_COOKIE}=;`));
      expect(cookies(res)).toMatch(
        new RegExp(`${BUYER_GOOGLE_STATE_COOKIE}=;`),
      );
    });

    it('does not log the code or the ticket cookie', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const err = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      exchange.mockRejectedValue(new Error('exchange failed'));
      const { state, nonce } = start(true);
      const value = ticket();

      await call(state, nonce, [`${CLAIM_TICKET_COOKIE}=${value}`]).expect(302);

      const logged = JSON.stringify([...spy.mock.calls, ...err.mock.calls]);
      expect(logged).not.toContain('google-code');
      expect(logged).not.toContain(value);
      spy.mockRestore();
      err.mockRestore();
    });
  });
});
