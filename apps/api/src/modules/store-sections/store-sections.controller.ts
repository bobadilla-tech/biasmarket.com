import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { StoreSectionsService } from './store-sections.service.js';
import { CreateStoreSectionDto } from './dto/create-store-section.dto.js';
import { UpdateStoreSectionDto } from './dto/update-store-section.dto.js';
import { ReorderStoreSectionsDto } from './dto/reorder-store-sections.dto.js';

@Controller('stores/:storeId/sections')
@UseGuards(AuthGuard)
export class StoreSectionsController {
  constructor(private sections: StoreSectionsService) {}

  @Post()
  create(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreateStoreSectionDto,
  ) {
    return this.sections.create(storeId, session.user.id, dto);
  }

  @Get()
  findAll(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.sections.findAllForStore(storeId, session.user.id);
  }

  @Patch('reorder')
  reorder(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: ReorderStoreSectionsDto,
  ) {
    return this.sections.reorder(storeId, session.user.id, dto);
  }

  @Patch(':sectionId')
  update(
    @Param('storeId') storeId: string,
    @Param('sectionId') sectionId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateStoreSectionDto,
  ) {
    return this.sections.update(sectionId, storeId, session.user.id, dto);
  }

  @Delete(':sectionId')
  delete(
    @Param('storeId') storeId: string,
    @Param('sectionId') sectionId: string,
    @Session() session: UserSession,
  ) {
    return this.sections.delete(sectionId, storeId, session.user.id);
  }
}
