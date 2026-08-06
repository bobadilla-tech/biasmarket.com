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
import type { CollectionsService } from "./collections.service.js";
import type { CreateCollectionDto } from "./dto/create-collection.dto.js";
import type { UpdateCollectionDto } from "./dto/update-collection.dto.js";
import type { AddCollectionProductDto } from "./dto/add-collection-product.dto.js";
import type { ReorderCollectionProductsDto } from "./dto/reorder-collection-products.dto.js";
import type {
  CollectionProductResponseDto,
  CollectionResponseDto,
  CollectionWithProductsResponseDto,
} from "./dto/collection-response.dto.js";

@Controller("stores/:storeId/collections")
@UseGuards(AuthGuard)
export class CollectionsController {
  constructor(private collections: CollectionsService) {}

  @Post()
  create(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.collections.create(storeId, session.user.id, dto);
  }

  @Get()
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<CollectionWithProductsResponseDto[]> {
    const collections = await this.collections.findAllForStore(
      storeId,
      session.user.id,
    );
    // Prisma returns `Decimal`/`Date` instances here, not the `string`s the
    // response DTO declares — see the money/Decimal convention note in
    // dto/collection-response.dto.ts for why the DTO stays typed `string`
    // rather than `Prisma.Decimal`/`Date`.
    return collections.map((collection) => ({
      ...collection,
      products: collection.products.map((collectionProduct) => ({
        ...collectionProduct,
        product: {
          ...collectionProduct.product,
          price: collectionProduct.product.price.toString(),
          availableUntil:
            collectionProduct.product.availableUntil?.toISOString() ?? null,
          deletedAt: collectionProduct.product.deletedAt?.toISOString() ?? null,
          createdAt: collectionProduct.product.createdAt.toISOString(),
        },
      })),
    }));
  }

  @Patch(":collectionId")
  update(
    @Param("storeId") storeId: string,
    @Param("collectionId") collectionId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.collections.update(collectionId, storeId, session.user.id, dto);
  }

  @Delete(":collectionId")
  delete(
    @Param("storeId") storeId: string,
    @Param("collectionId") collectionId: string,
    @Session() session: UserSession,
  ): Promise<CollectionResponseDto> {
    return this.collections.delete(collectionId, storeId, session.user.id);
  }

  @Post(":collectionId/products")
  addProduct(
    @Param("storeId") storeId: string,
    @Param("collectionId") collectionId: string,
    @Session() session: UserSession,
    @Body() dto: AddCollectionProductDto,
  ): Promise<CollectionProductResponseDto> {
    return this.collections.addProduct(
      collectionId,
      storeId,
      session.user.id,
      dto,
    );
  }

  @Delete(":collectionId/products/:productId")
  removeProduct(
    @Param("storeId") storeId: string,
    @Param("collectionId") collectionId: string,
    @Param("productId") productId: string,
    @Session() session: UserSession,
  ): Promise<CollectionProductResponseDto> {
    return this.collections.removeProduct(
      collectionId,
      storeId,
      session.user.id,
      productId,
    );
  }

  @Patch(":collectionId/products/reorder")
  reorderProducts(
    @Param("storeId") storeId: string,
    @Param("collectionId") collectionId: string,
    @Session() session: UserSession,
    @Body() dto: ReorderCollectionProductsDto,
  ): Promise<CollectionProductResponseDto[]> {
    return this.collections.reorderProducts(
      collectionId,
      storeId,
      session.user.id,
      dto,
    );
  }
}
