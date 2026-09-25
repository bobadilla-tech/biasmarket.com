import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ALLOW_NO_ORIGIN, AllowNoOrigin, OriginGuard } from './origin.guard.js';
import { createCustomerSessionToken } from '@biasmarket/utils/customer-account-token';

function buildContext(
  headers: Record<string, string | undefined>,
  options: { allowNoOrigin?: boolean } = {},
) {
  const handler = (): void => {};
  if (options.allowNoOrigin) {
    Reflect.defineMetadata(ALLOW_NO_ORIGIN, true, handler);
  }
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  const guard = new OriginGuard();
  let validToken: string;

  beforeEach(() => {
    process.env.WEB_URL = 'https://web.example.com';
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = 'test-secret';
    validToken = createCustomerSessionToken('buyer-1', 1, 'test-secret');
  });

  describe('cookie-mode origin enforcement (unchanged)', () => {
    it('allows a request whose Origin matches WEB_URL', () => {
      expect(
        guard.canActivate(buildContext({ origin: 'https://web.example.com' })),
      ).toBe(true);
    });

    it('falls back to Referer when Origin is absent', () => {
      expect(
        guard.canActivate(
          buildContext({
            referer: 'https://web.example.com/store/x/account/login',
          }),
        ),
      ).toBe(true);
    });

    it('rejects a cross-origin request', () => {
      expect(() =>
        guard.canActivate(buildContext({ origin: 'https://evil.example.com' })),
      ).toThrow(ForbiddenException);
    });

    it('rejects a request with neither Origin nor Referer (not an @AllowNoOrigin route)', () => {
      expect(() => guard.canActivate(buildContext({}))).toThrow(
        ForbiddenException,
      );
    });

    it('rejects a malformed Origin header', () => {
      expect(() =>
        guard.canActivate(buildContext({ origin: 'not-a-url' })),
      ).toThrow(ForbiddenException);
    });

    it('rejects a no-Origin request that carries a cookie token but no bearer token', () => {
      expect(() =>
        guard.canActivate(
          buildContext({ cookie: `bm_customer_session=${validToken}` }),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('verified-bearer exemption', () => {
    it('allows a request with a verified bearer token and no Origin', () => {
      expect(
        guard.canActivate(
          buildContext({ authorization: `Bearer ${validToken}` }),
        ),
      ).toBe(true);
    });

    it('allows a verified bearer token even on cross-origin header', () => {
      expect(
        guard.canActivate(
          buildContext({
            authorization: `Bearer ${validToken}`,
            origin: 'https://evil.example.com',
          }),
        ),
      ).toBe(true);
    });

    it('does NOT skip the Origin check on the mere presence of an invalid Authorization header', () => {
      // The single most security-critical assertion of the mobile plan: an
      // unverified/forged bearer token must NOT bypass OriginGuard, or a CSRF
      // attacker could send any `Authorization: Bearer x` string and skip the
      // check entirely. With no Origin present, the guard must still reject.
      expect(() =>
        guard.canActivate(
          buildContext({ authorization: 'Bearer forged-token' }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('rejects a malformed Authorization header without skipping the Origin check', () => {
      expect(() =>
        guard.canActivate(buildContext({ authorization: 'Bearer' })),
      ).toThrow(ForbiddenException);
    });
  });

  describe('non-browser (@AllowNoOrigin) exemption', () => {
    it('allows a no-Origin request on an @AllowNoOrigin route', () => {
      expect(guard.canActivate(buildContext({}, { allowNoOrigin: true }))).toBe(
        true,
      );
    });

    it('still enforces the Origin check on an @AllowNoOrigin route when a cross-origin Origin IS present', () => {
      expect(() =>
        guard.canActivate(
          buildContext(
            { origin: 'https://evil.example.com' },
            { allowNoOrigin: true },
          ),
        ),
      ).toThrow(ForbiddenException);
    });

    it('still enforces the Origin check on an @AllowNoOrigin route when a matching Origin IS present', () => {
      expect(
        guard.canActivate(
          buildContext(
            { origin: 'https://web.example.com' },
            { allowNoOrigin: true },
          ),
        ),
      ).toBe(true);
    });
  });

  it('AllowNoOrigin() decorator sets the metadata the guard reads', () => {
    class Routes {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      plain(): void {}
      @AllowNoOrigin()
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      marked(): void {}
    }
    expect(Reflect.getMetadata(ALLOW_NO_ORIGIN, Routes.prototype.marked)).toBe(
      true,
    );
    expect(Reflect.getMetadata(ALLOW_NO_ORIGIN, Routes.prototype.plain)).toBe(
      undefined,
    );
  });
});
