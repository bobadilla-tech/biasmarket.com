import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
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
}
