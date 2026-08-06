import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, Public, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { RestockService } from "./restock.service.js";
import { CreateRestockRequestDto } from "./dto/create-restock-request.dto.js";

@Controller("stores")
export class RestockController {
  constructor(private restock: RestockService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post(":slug/restock-requests")
  create(@Param("slug") slug: string, @Body() dto: CreateRestockRequestDto) {
    return this.restock.create(slug, dto);
  }

  @UseGuards(AuthGuard)
  @Get(":storeId/restock-requests")
  list(@Param("storeId") storeId: string, @Session() session: UserSession) {
    return this.restock.listForStore(storeId, session.user.id);
  }
}
