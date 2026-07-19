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
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { CreateVariantDto } from './dto/create-variant.dto.js';

@Controller('stores/:storeId/products')
@UseGuards(AuthGuard)
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Post()
  create(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(storeId, session.user.id, dto);
  }

  @Get()
  findAll(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.products.findAllForStore(storeId, session.user.id);
  }

  @Patch(':productId')
  update(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(productId, storeId, session.user.id, dto);
  }

  @Patch(':productId/publish')
  publish(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Session() session: UserSession,
  ) {
    return this.products.publish(productId, storeId, session.user.id);
  }

  @Delete(':productId')
  softDelete(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Session() session: UserSession,
  ) {
    return this.products.softDelete(productId, storeId, session.user.id);
  }

  @Post(':productId/variants')
  addVariant(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Session() session: UserSession,
    @Body() dto: CreateVariantDto,
  ) {
    return this.products.addVariant(productId, storeId, session.user.id, dto);
  }

  @Get(':productId/variants')
  listVariants(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Session() session: UserSession,
  ) {
    return this.products.listVariants(productId, storeId, session.user.id);
  }
}
