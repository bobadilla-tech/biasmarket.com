import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { StoresService } from "./stores.service.js";
import { StoreResponseDto } from "./dto/store-response.dto.js";
import { toStoreDto } from "./stores.mapper.js";

@Controller("me/stores")
export class MyStoresController {
  constructor(private stores: StoresService) {}

  @UseGuards(AuthGuard)
  @Get()
  async findMine(
    @Session() session: UserSession,
  ): Promise<StoreResponseDto[]> {
    const stores = await this.stores.findAllForUser(session.user.id);
    return stores.map(toStoreDto);
  }
}
