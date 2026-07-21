import { Body, Controller, Get, Post, Patch, UseGuards, Delete, Param } from '@nestjs/common';
import { AuthGuard, Public, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { StoresService } from './stores.service.js';
import { UpdateStoreDto } from './dto/update-store.dto.js';
import { CreateStoreDto } from './dto/create-store.dto.js';

@Controller('stores')
export class StoresController {
  constructor(private stores: StoresService) {}

  @UseGuards(AuthGuard)
  @Post()
  create(@Session() session: UserSession, @Body() dto: CreateStoreDto) {
    return this.stores.create(session.user.id, dto);
  }

  @UseGuards(AuthGuard)
  @Get('/me/stores')
  findMine(@Session() session: UserSession) {
    return this.stores.findAllForUser(session.user.id);
  }

  @UseGuards(AuthGuard)
  @Get('by-slug/:slug')
  findBySlug(@Param('slug') slug: string, @Session() session: UserSession) {
    return this.stores.findBySlugForOwner(slug, session.user.id);
  }

  @UseGuards(AuthGuard)
  @Patch(':storeId')
  update(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.stores.update(storeId, session.user.id, dto);
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
