import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { StoreSectionsService } from "./store-sections.service.js";
import { CreateStoreSectionDto } from "./dto/create-store-section.dto.js";
import { UpdateStoreSectionDto } from "./dto/update-store-section.dto.js";
import { ReorderStoreSectionsDto } from "./dto/reorder-store-sections.dto.js";
import { StoreSectionResponseDto } from "./dto/store-section-response.dto.js";

interface StoreSectionRow {
  id: string;
  storeId: string;
  type: "COLLECTION" | "BANNER" | "TEXT_BLOCK";
  collectionId: string | null;
  content: unknown;
  position: number;
  createdAt: Date;
}

function toSectionDto(section: StoreSectionRow): StoreSectionResponseDto {
  return {
    ...section,
    content: section.content as Record<string, unknown>,
    createdAt: section.createdAt.toISOString(),
  };
}

@Controller("stores/:storeId/sections")
@UseGuards(AuthGuard)
export class StoreSectionsController {
  constructor(private sections: StoreSectionsService) {}

  @Post()
  async create(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreateStoreSectionDto,
  ): Promise<StoreSectionResponseDto> {
    const section = await this.sections.create(storeId, session.user.id, dto);
    return toSectionDto(section);
  }

  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<StoreSectionResponseDto[]> {
    const sections = await this.sections.findAllForStore(
      storeId,
      session.user.id,
    );
    return sections.map(toSectionDto);
  }

  @Patch("reorder")
  async reorder(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: ReorderStoreSectionsDto,
  ): Promise<StoreSectionResponseDto[]> {
    const sections = await this.sections.reorder(
      storeId,
      session.user.id,
      dto,
    );
    return sections.map(toSectionDto);
  }

  @Patch(":sectionId")
  async update(
    @Param("storeId") storeId: string,
    @Param("sectionId") sectionId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateStoreSectionDto,
  ): Promise<StoreSectionResponseDto> {
    const section = await this.sections.update(
      sectionId,
      storeId,
      session.user.id,
      dto,
    );
    return toSectionDto(section);
  }

  @Delete(":sectionId")
  async delete(
    @Param("storeId") storeId: string,
    @Param("sectionId") sectionId: string,
    @Session() session: UserSession,
  ): Promise<StoreSectionResponseDto> {
    const section = await this.sections.delete(
      sectionId,
      storeId,
      session.user.id,
    );
    return toSectionDto(section);
  }
}
