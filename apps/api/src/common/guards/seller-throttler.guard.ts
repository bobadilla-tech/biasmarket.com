import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Seller routes are throttled per signed-in user rather than per IP, so
// sellers who share an IP (an office, a mobile carrier) do not share a bucket.
// Falls back to the IP when there is no session. Runs after the global
// better-auth AuthGuard, which sets `request.session`. The throttler key
// already includes the handler, so buckets are per endpoint.
@Injectable()
export class SellerThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const userId: unknown = req.session?.user?.id;
    return Promise.resolve(typeof userId === 'string' ? userId : req.ip);
  }
}
