import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { StatsService } from './stats.service.js';
import type { AnalyticsRange } from './analytics.types.js';

const ANALYTICS_RANGES: AnalyticsRange[] = ['30d', '90d', '12m'];

@Controller('stores/:storeId/stats')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get('overview')
  overview(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.stats.getOverview(storeId, session.user.id);
  }

  @Get('analytics')
  analytics(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Query('range') range: string | undefined,
  ) {
    const resolvedRange = (range ?? '30d') as AnalyticsRange;
    if (!ANALYTICS_RANGES.includes(resolvedRange)) {
      throw new BadRequestException('Rango inválido');
    }
    return this.stats.getAnalytics(storeId, session.user.id, resolvedRange);
  }
}
