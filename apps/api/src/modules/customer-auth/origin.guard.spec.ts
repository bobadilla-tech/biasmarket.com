import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OriginGuard } from './origin.guard.js';

function buildContext(headers: Record<string, string | undefined>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  const guard = new OriginGuard();

  beforeEach(() => {
    process.env.WEB_URL = 'https://web.example.com';
  });

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

  it('rejects a request with neither Origin nor Referer', () => {
    expect(() => guard.canActivate(buildContext({}))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a malformed Origin header', () => {
    expect(() =>
      guard.canActivate(buildContext({ origin: 'not-a-url' })),
    ).toThrow(ForbiddenException);
  });
});
