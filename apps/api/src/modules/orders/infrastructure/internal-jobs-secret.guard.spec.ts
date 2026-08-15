import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { InternalJobsSecretGuard } from './internal-jobs-secret.guard.js';
import { INTERNAL_JOBS_SECRET_HEADER } from '@biasmarket/queue';

const REAL_SECRET = 'correct-secret-value';

function buildContext(headerValue: string | undefined): ExecutionContext {
  const req = { headers: { [INTERNAL_JOBS_SECRET_HEADER]: headerValue } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('InternalJobsSecretGuard', () => {
  let guard: InternalJobsSecretGuard;

  beforeEach(() => {
    process.env.INTERNAL_JOBS_SECRET = REAL_SECRET;
    guard = new InternalJobsSecretGuard();
  });

  it('allows a request carrying the correct secret', () => {
    expect(guard.canActivate(buildContext(REAL_SECRET))).toBe(true);
  });

  it('rejects a missing secret header', () => {
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong secret of a different length', () => {
    expect(() => guard.canActivate(buildContext('nope'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong secret of the same length (exercises timingSafeEqual, not just the length check)', () => {
    const sameLengthWrongSecret = 'x'.repeat(REAL_SECRET.length);
    expect(() =>
      guard.canActivate(buildContext(sameLengthWrongSecret)),
    ).toThrow(UnauthorizedException);
  });
});
