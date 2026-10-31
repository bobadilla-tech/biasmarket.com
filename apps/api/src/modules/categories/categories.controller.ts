import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes } from "@nestjs/swagger";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { CategoriesService } from "./categories.service.js";
import { CreateCategoryDto } from "./dto/create-category.dto.js";
import { UpdateCategoryDto } from "./dto/update-category.dto.js";
import type { CategoryResponseDto } from "./dto/category-response.dto.js";
import { StorageService } from "../../storage/storage.service.js";
import {
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  UploadedFileValidationPipe,
  type ValidatedUploadedFile,
} from "../../common/uploaded-file-validation.pipe.js";

const CATEGORY_IMAGE_PIPE = new UploadedFileValidationPipe({
  allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
});

interface CategoryRow {
  id: string;
  storeId: string;
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  createdAt: Date;
  _count?: { products: number };
}

function toCategoryDto(category: CategoryRow): CategoryResponseDto {
  const { _count, ...row } = category;
  return {
    ...row,
    productCount: _count?.products ?? 0,
    createdAt: category.createdAt.toISOString(),
  };
}

@Controller("stores/:storeId/categories")
@UseGuards(AuthGuard)
export class CategoriesController {
  constructor(
    private categories: CategoriesService,
    private storage: StorageService,
  ) {}

  @Post()
  async create(
    @Param("storeId") storeId: string,
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
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<CategoryResponseDto[]> {
    const categories = await this.categories.findAllForStore(
      storeId,
      session.user.id,
    );
    return categories.map(toCategoryDto);
  }

  @Patch(":categoryId")
  async update(
    @Param("storeId") storeId: string,
    @Param("categoryId") categoryId: string,
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

  @Delete(":categoryId")
  async delete(
    @Param("storeId") storeId: string,
    @Param("categoryId") categoryId: string,
    @Session() session: UserSession,
  ): Promise<CategoryResponseDto> {
    const category = await this.categories.delete(
      categoryId,
      storeId,
      session.user.id,
    );
    return toCategoryDto(category);
  }

  @Post(":categoryId/image")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES + 1 },
    }),
  )
  async uploadImage(
    @Param("storeId") storeId: string,
    @Param("categoryId") categoryId: string,
    @Session() session: UserSession,
    @UploadedFile(CATEGORY_IMAGE_PIPE) file: ValidatedUploadedFile,
  ): Promise<CategoryResponseDto> {
    await this.categories.assertOwnership(storeId, session.user.id);
    const categoryUrl = await this.storage.uploadStoreCategoryImage(
      file.buffer,
      file.detectedMimeType,
    );
    try {
      const category = await this.categories.updateImage(
        categoryId,
        storeId,
        session.user.id,
        categoryUrl,
      );
      return toCategoryDto(category);
    } catch (error) {
      await this.storage.deleteImage(categoryUrl).catch(() => undefined);
      throw error;
    }
  }
}
