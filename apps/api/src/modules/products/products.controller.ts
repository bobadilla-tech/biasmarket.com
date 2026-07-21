import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards, UseInterceptors, UploadedFile, BadRequestException
} from '@nestjs/common';
import { AuthGuard, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { CreateVariantDto } from './dto/create-variant.dto.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../../storage/storage.service.js';


@Controller('stores/:storeId/products')
@UseGuards(AuthGuard)
export class ProductsController {
  
  constructor(
    private products: ProductsService,
    private storage: StorageService,
  ) { }

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

  @Post(':productId/images')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Missing File');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Max 5MB');

    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
    const isPng = file.buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    if (!isJpeg && !isPng) throw new BadRequestException('Just JPEG or PNG');

    const url = await this.storage.uploadImage(file.buffer, isPng ? 'image/png' : 'image/jpeg');
    return this.products.addImage(productId, storeId, session.user.id, url);

    
  }
}
