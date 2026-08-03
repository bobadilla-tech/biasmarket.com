import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { SuggestionsService } from "./suggestions.service.js";

@Controller("stores/:storeId/suggestions")
@UseGuards(AuthGuard)
export class SuggestionsController {
  constructor(private suggestions: SuggestionsService) {}

  @Get()
  findAll(@Param("storeId") storeId: string, @Session() session: UserSession) {
    return this.suggestions.getSuggestions(storeId, session.user.id);
  }
}
