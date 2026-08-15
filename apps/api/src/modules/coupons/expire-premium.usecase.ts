import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

// Mirrors expire-orders.usecase.ts's role for the orders domain: nothing
// else resets User.plan back to "basic" once premiumUntil naturally
// expires (see docs/plans/2026-08-15-premium-coupon-system-audit.md's M7)
// — every authorization path already re-checks premiumUntil rather than
// trusting plan alone, so this is a data-correctness sweep, not a security
// fix. Unlike orders' per-row transaction (which also releases stock and
// writes an audit trail), this is a single unconditional updateMany: there's
// no side effect beyond the two columns themselves.
@Injectable()
export class ExpirePremiumUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<{ expired: number }> {
    const result = await this.prisma.user.updateMany({
      where: {
        plan: 'premium',
        premiumUntil: { lt: new Date() },
      },
      data: { plan: 'basic', premiumUntil: null },
    });

    return { expired: result.count };
  }
}
