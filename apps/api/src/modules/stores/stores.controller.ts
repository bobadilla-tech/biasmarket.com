import { Body, Controller, Get, Post, UseGuards, Delete, Param } from '@nestjs/common';
import { AuthGuard, Public, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { StoresService } from './stores.service.js';

@Controller('stores')
export class StoresController {
  constructor(private stores: StoresService) {}

  @UseGuards(AuthGuard)
  @Post()
  create(
    @Session() session: UserSession,
    @Body() body: { name: string; slug: string },
  ) {
    return this.stores.create(session.user.id, body.name, body.slug);
  }

  @UseGuards(AuthGuard)
  @Get('/me/stores')
  findMine(@Session() session: UserSession) {
    return this.stores.findAllForUser(session.user.id);
  }

  @UseGuards(AuthGuard)
  @Delete(':storeId')
  delete(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.stores.delete(storeId, session.user.id);
  }

  @Public()
  @Get(':slug/public')
  findPublic(@Param('slug') slug: string) {
    return this.stores.findPublicBySlug(slug);
  }

}
