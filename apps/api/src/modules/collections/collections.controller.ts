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
import { CollectionsService } from './collections.service.js';
import { CreateCollectionDto } from './dto/create-collection.dto.js';
import { UpdateCollectionDto } from './dto/update-collection.dto.js';
import { AddCollectionProductDto } from './dto/add-collection-product.dto.js';
import { ReorderCollectionProductsDto } from './dto/reorder-collection-products.dto.js';

@Controller('stores/:storeId/collections')
@UseGuards(AuthGuard)
export class CollectionsController {
  constructor(private collections: CollectionsService) {}

  @Post()
  create(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreateCollectionDto,
  ) {
    return this.collections.create(storeId, session.user.id, dto);
  }

  @Get()
  findAll(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.collections.findAllForStore(storeId, session.user.id);
  }

  @Patch(':collectionId')
  update(
    @Param('storeId') storeId: string,
    @Param('collectionId') collectionId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collections.update(collectionId, storeId, session.user.id, dto);
  }

  @Delete(':collectionId')
  delete(
    @Param('storeId') storeId: string,
    @Param('collectionId') collectionId: string,
    @Session() session: UserSession,
  ) {
    return this.collections.delete(collectionId, storeId, session.user.id);
  }

  @Post(':collectionId/products')
  addProduct(
    @Param('storeId') storeId: string,
    @Param('collectionId') collectionId: string,
    @Session() session: UserSession,
    @Body() dto: AddCollectionProductDto,
  ) {
    return this.collections.addProduct(collectionId, storeId, session.user.id, dto);
  }

  @Delete(':collectionId/products/:productId')
  removeProduct(
    @Param('storeId') storeId: string,
    @Param('collectionId') collectionId: string,
    @Param('productId') productId: string,
    @Session() session: UserSession,
  ) {
    return this.collections.removeProduct(
      collectionId,
      storeId,
      session.user.id,
      productId,
    );
  }

  @Patch(':collectionId/products/reorder')
  reorderProducts(
    @Param('storeId') storeId: string,
    @Param('collectionId') collectionId: string,
    @Session() session: UserSession,
    @Body() dto: ReorderCollectionProductsDto,
  ) {
    return this.collections.reorderProducts(
      collectionId,
      storeId,
      session.user.id,
      dto,
    );
  }
}
