import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, type ThrottlerStorage } from '@nestjs/throttler';
import { SellerThrottlerGuard } from './seller-throttler.guard.js';

describe('SellerThrottlerGuard', () => {
  const guard = new SellerThrottlerGuard(
    { throttlers: [{ ttl: 60_000, limit: 20 }] },
    {} as ThrottlerStorage,
    new Reflector(),
  );
  const tracker = (req: Record<string, unknown>) =>
    (
      guard as unknown as { getTracker(r: unknown): Promise<string> }
    ).getTracker(req);

  it('extends the stock ThrottlerGuard', () => {
    expect(guard).toBeInstanceOf(ThrottlerGuard);
  });

  it('keys by user id, so two users behind one IP get separate buckets', async () => {
    const a = await tracker({
      ip: '10.0.0.1',
      session: { user: { id: 'u1' } },
    });
    const b = await tracker({
      ip: '10.0.0.1',
      session: { user: { id: 'u2' } },
    });
    expect(a).toBe('u1');
    expect(b).toBe('u2');
  });

  it('falls back to the IP without a session', async () => {
    expect(await tracker({ ip: '10.0.0.1' })).toBe('10.0.0.1');
  });
});
