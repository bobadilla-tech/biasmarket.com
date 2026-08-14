import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, Public, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { RestockService } from './restock.service.js';
import { CreateRestockRequestDto } from './dto/create-restock-request.dto.js';
import type {
  RestockCountResponseDto,
  RestockRequestResponseDto,
  RestockRequestResultResponseDto,
} from './dto/restock-response.dto.js';

@Controller('stores')
export class RestockController {
  constructor(private restock: RestockService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post(':slug/restock-requests')
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateRestockRequestDto,
  ): Promise<RestockRequestResultResponseDto> {
    const result = await this.restock.create(slug, dto);
    // Prisma returns a `Date` here, not the `string` the response DTO
    // declares — same Date-as-string convention as the notifications module.
    return { ...result, createdAt: result.createdAt.toISOString() };
  }

  @UseGuards(AuthGuard)
  @Get(':storeId/restock-requests')
  async list(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
  ): Promise<RestockRequestResponseDto[]> {
    const requests = await this.restock.listForStore(storeId, session.user.id);
    return requests.map((request) => ({
      ...request,
      createdAt: request.createdAt.toISOString(),
    }));
  }

  @UseGuards(AuthGuard)
  @Get(':storeId/restock-requests/count')
  count(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
  ): Promise<RestockCountResponseDto> {
    return this.restock.count(storeId, session.user.id);
  }
}
