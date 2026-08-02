import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { StatsService } from './stats.service.js';

@Controller('stores/:storeId/stats')
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get('overview')
  overview(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.stats.getOverview(storeId, session.user.id);
  }
}
