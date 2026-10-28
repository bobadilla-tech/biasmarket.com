import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Seller routes are throttled per signed-in user. The IP buckets of the plain
// ThrottlerGuard are effectively global behind Caddy (main.ts never sets
// `trust proxy`), so one seller could lock every other seller out. Runs after
// the global better-auth AuthGuard, which sets `request.session`. The
// throttler key already includes the handler, so buckets are per endpoint.
@Injectable()
export class SellerThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const userId: unknown = req.session?.user?.id;
    return Promise.resolve(typeof userId === 'string' ? userId : req.ip);
  }
}
