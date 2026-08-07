import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiConsumes, ApiQuery } from "@nestjs/swagger";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { ProductsService } from "./products.service.js";
import { CreateProductDto } from "./dto/create-product.dto.js";
import { UpdateProductDto } from "./dto/update-product.dto.js";
import { CreateVariantDto } from "./dto/create-variant.dto.js";
import { UpdateVariantDto } from "./dto/update-variant.dto.js";
import { FileInterceptor } from "@nestjs/platform-express";
import { StorageService } from "../../storage/storage.service.js";
import type {
  ProductDetailResponseDto,
  ProductResponseDto,
  ProductWithVariantsResponseDto,
  VariantResponseDto,
} from "./dto/product-response.dto.js";

// Structural, not `Prisma.Product`/`Prisma.ProductVariant` — importing the
// Prisma-generated types here would reproduce the metadata-generator bug the
// response DTO file's top comment describes. `{ toString(): string }` is
// enough to accept a real `Prisma.Decimal` without naming its type.
type ProductRow = {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: { toString(): string };
  currency: string;
  images: string[];
  availableUntil: Date | null;
  status: "DRAFT" | "PUBLISHED";
  soldOut: boolean;
  discontinued: boolean;
  deletedAt: Date | null;
  createdAt: Date;
};

type VariantRow = {
  id: string;
  productId: string;
  storeId: string;
  name: string;
  stock: number | null;
  reserved: number;
  priceOverride: { toString(): string } | null;
  imageOverride: string | null;
  attributes: unknown;
};

function toProductDto(product: ProductRow): ProductResponseDto {
  return {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    description: product.description,
    price: product.price.toString(),
    currency: product.currency,
    images: product.images,
    availableUntil: product.availableUntil?.toISOString() ?? null,
    status: product.status,
    soldOut: product.soldOut,
    discontinued: product.discontinued,
    deletedAt: product.deletedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
  };
}

function toVariantDto(variant: VariantRow): VariantResponseDto {
  return {
    id: variant.id,
    productId: variant.productId,
    storeId: variant.storeId,
    name: variant.name,
    stock: variant.stock,
    reserved: variant.reserved,
    priceOverride: variant.priceOverride?.toString() ?? null,
    imageOverride: variant.imageOverride,
    attributes: (variant.attributes ?? {}) as Record<string, string>,
  };
}

type ProductDetailRow = ProductRow & {
  variants: VariantRow[];
  categories: {
    productId: string;
    categoryId: string;
    category: { id: string; name: string };
  }[];
  soldUnits: number;
  availableStock: number | null;
};

function toProductDetailDto(
  product: ProductDetailRow,
): ProductDetailResponseDto {
  return {
    ...toProductDto(product),
    variants: product.variants.map(toVariantDto),
    categories: product.categories.map((productCategory) => ({
      productId: productCategory.productId,
      categoryId: productCategory.categoryId,
      category: {
        id: productCategory.category.id,
        name: productCategory.category.name,
      },
    })),
    soldUnits: product.soldUnits,
    availableStock: product.availableStock,
  };
}

@Controller("stores/:storeId/products")
@UseGuards(AuthGuard)
export class ProductsController {
  constructor(
    private products: ProductsService,
    private storage: StorageService,
  ) {}

  @Post()
  async create(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreateProductDto,
  ): Promise<ProductWithVariantsResponseDto> {
    const product = await this.products.create(storeId, session.user.id, dto);
    return {
      ...toProductDto(product),
      variants: product.variants.map(toVariantDto),
    };
  }

  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<ProductDetailResponseDto[]> {
    const products = await this.products.findAllForStore(
      storeId,
      session.user.id,
    );
    return products.map(toProductDetailDto);
  }

  @Get(":productId")
  async findOne(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Session() session: UserSession,
  ): Promise<ProductDetailResponseDto> {
    const product = await this.products.findOne(
      storeId,
      productId,
      session.user.id,
    );
    return toProductDetailDto(product);
  }

  @Patch(":productId")
  async update(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const product = await this.products.update(
      productId,
      storeId,
      session.user.id,
      dto,
    );
    return toProductDto(product);
  }

  @Patch(":productId/publish")
  async publish(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Session() session: UserSession,
  ): Promise<ProductResponseDto> {
    const product = await this.products.publish(
      productId,
      storeId,
      session.user.id,
    );
    return toProductDto(product);
  }

  @Delete(":productId")
  async softDelete(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Session() session: UserSession,
  ): Promise<ProductResponseDto> {
    const product = await this.products.softDelete(
      productId,
      storeId,
      session.user.id,
    );
    return toProductDto(product);
  }

  @Post(":productId/variants")
  async addVariant(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Session() session: UserSession,
    @Body() dto: CreateVariantDto,
  ): Promise<VariantResponseDto> {
    const variant = await this.products.addVariant(
      productId,
      storeId,
      session.user.id,
      dto,
    );
    return toVariantDto(variant);
  }

  @Get(":productId/variants")
  async listVariants(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Session() session: UserSession,
  ): Promise<VariantResponseDto[]> {
    const variants = await this.products.listVariants(
      productId,
      storeId,
      session.user.id,
    );
    return variants.map(toVariantDto);
  }

  @Patch(":productId/variants/:variantId")
  async updateVariant(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Param("variantId") variantId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateVariantDto,
  ): Promise<VariantResponseDto> {
    const variant = await this.products.updateVariant(
      productId,
      variantId,
      storeId,
      session.user.id,
      dto,
    );
    return toVariantDto(variant);
  }

  @Delete(":productId/variants/:variantId")
  async deleteVariant(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Param("variantId") variantId: string,
    @Session() session: UserSession,
  ): Promise<VariantResponseDto> {
    const variant = await this.products.deleteVariant(
      productId,
      variantId,
      storeId,
      session.user.id,
    );
    return toVariantDto(variant);
  }

  @Post(":productId/images")
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "replace", required: false, type: String })
  @UseInterceptors(FileInterceptor("file"))
  async uploadImage(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
    @Query("replace") replace?: string,
  ): Promise<ProductResponseDto> {
    if (!file) throw new BadRequestException("Missing File");
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException("Max 5MB");

    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
    const isPng = file.buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    if (!isJpeg && !isPng) throw new BadRequestException("Just JPEG or PNG");

    const url = await this.storage.uploadImage(
      file.buffer,
      isPng ? "image/png" : "image/jpeg",
    );
    const product = await this.products.addImage(
      productId,
      storeId,
      session.user.id,
      url,
      replace === "1" || replace === "true",
    );
    return toProductDto(product);
  }

  @Post(":productId/variants/:variantId/images")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async uploadVariantImage(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Param("variantId") variantId: string,
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<VariantResponseDto> {
    if (!file) throw new BadRequestException("Missing File");
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException("Max 5MB");

    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
    const isPng = file.buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    if (!isJpeg && !isPng) throw new BadRequestException("Just JPEG or PNG");

    const url = await this.storage.uploadImage(
      file.buffer,
      isPng ? "image/png" : "image/jpeg",
    );
    const variant = await this.products.addVariantImage(
      variantId,
      productId,
      storeId,
      session.user.id,
      url,
    );
    return toVariantDto(variant);
  }
}
