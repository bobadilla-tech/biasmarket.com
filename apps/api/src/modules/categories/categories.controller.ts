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
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@Controller('stores/:storeId/categories')
@UseGuards(AuthGuard)
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Post()
  create(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categories.create(storeId, session.user.id, dto);
  }

  @Get()
  findAll(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.categories.findAllForStore(storeId, session.user.id);
  }

  @Patch(':categoryId')
  update(
    @Param('storeId') storeId: string,
    @Param('categoryId') categoryId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(categoryId, storeId, session.user.id, dto);
  }

  @Delete(':categoryId')
  delete(
    @Param('storeId') storeId: string,
    @Param('categoryId') categoryId: string,
    @Session() session: UserSession,
  ) {
    return this.categories.delete(categoryId, storeId, session.user.id);
  }
}
