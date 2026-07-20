import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { StoresService } from './stores.service.js';


@Controller('me/stores')
export class MyStoresController {
  constructor(private stores: StoresService) {}

  @UseGuards(AuthGuard)
  @Get()
  findMine(@Session() session: UserSession) {
    return this.stores.findAllForUser(session.user.id);
  }
}
