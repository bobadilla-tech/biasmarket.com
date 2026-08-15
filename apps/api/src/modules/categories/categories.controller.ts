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
import type { CategoryResponseDto } from './dto/category-response.dto.js';

interface CategoryRow {
  id: string;
  storeId: string;
  parentId: string | null;
  name: string;
  createdAt: Date;
}

function toCategoryDto(category: CategoryRow): CategoryResponseDto {
  return { ...category, createdAt: category.createdAt.toISOString() };
}

@Controller('stores/:storeId/categories')
@UseGuards(AuthGuard)
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Post()
  async create(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const category = await this.categories.create(
      storeId,
      session.user.id,
      dto,
    );
    return toCategoryDto(category);
  }

  @Get()
  async findAll(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
  ): Promise<CategoryResponseDto[]> {
    const categories = await this.categories.findAllForStore(
      storeId,
      session.user.id,
    );
    return categories.map(toCategoryDto);
  }

  @Patch(':categoryId')
  async update(
    @Param('storeId') storeId: string,
    @Param('categoryId') categoryId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const category = await this.categories.update(
      categoryId,
      storeId,
      session.user.id,
      dto,
    );
    return toCategoryDto(category);
  }

  @Delete(':categoryId')
  async delete(
    @Param('storeId') storeId: string,
    @Param('categoryId') categoryId: string,
    @Session() session: UserSession,
  ): Promise<CategoryResponseDto> {
    const category = await this.categories.delete(
      categoryId,
      storeId,
      session.user.id,
    );
    return toCategoryDto(category);
  }
}
