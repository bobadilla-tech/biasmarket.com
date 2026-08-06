import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard, Roles } from "@thallesp/nestjs-better-auth";
import { UsersService } from "./users.service.js";
import { UserStoreCountResponseDto } from "./dto/user-store-count-response.dto.js";

@Controller("admin/users")
export class UsersController {
  constructor(private users: UsersService) {}

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @Get("store-counts")
  getStoreCounts(): Promise<UserStoreCountResponseDto[]> {
    return this.users.getStoreCounts();
  }
}
